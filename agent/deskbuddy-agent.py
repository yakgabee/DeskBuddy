#!/usr/bin/env python3
"""DeskBuddy agent: reports this computer's RAM and storage to the dashboard.

Run it on the server you want to watch:

    python3 deskbuddy-agent.py            # listens on port 9091

Then GET http://<this-computer>:9091/stats returns, e.g.:

    {"hostname": "server", "ram": {"total": ..., "used": ..., "percent": 41.2},
     "disks": [{"mount": "/", "total": ..., "used": ..., "percent": 63.0}]}

It is read-only and needs nothing but Python 3. Works on Linux and Windows.

On a Windows PC with Wallpaper Engine it also shares the current wallpaper, so the
dashboard can use it as its background:

    GET /wallpaper/info     ->  {"id", "title", "type": "video" | "image", "ext", "size"}
    GET /wallpaper/file     ->  the video (video wallpapers) or the preview image
    GET /wallpaper/preview  ->  the wallpaper's preview image

Scene and web wallpapers can't play on a Raspberry Pi, so their preview image is used.
If Wallpaper Engine isn't found automatically, set DESKBUDDY_WE_DIR to its folder
(the one containing config.json).
"""
import glob
import hashlib
import json
import mimetypes
import os
import re
import platform
import shutil
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("DESKBUDDY_AGENT_PORT", "9091"))

# Filesystems that are real storage (not RAM disks, snaps, containers, …)
REAL_FS = {"ext2", "ext3", "ext4", "xfs", "btrfs", "zfs", "f2fs", "jfs", "reiserfs",
           "ntfs", "ntfs3", "fuseblk", "exfat", "vfat", "hfsplus", "apfs"}
MIN_SIZE = 1_000_000_000  # ignore tiny partitions (boot, firmware, …)
SKIP_PREFIXES = ("/boot", "/snap", "/var/lib/docker", "/run", "/proc", "/sys", "/dev")


def pct(used, total):
    return round(used / total * 100, 1) if total else 0.0


def ram_linux():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            key, value = line.split(":", 1)
            info[key] = int(value.split()[0]) * 1024
    total = info["MemTotal"]
    used = total - info.get("MemAvailable", info.get("MemFree", 0))
    return {"total": total, "used": used, "percent": pct(used, total)}


def ram_windows():
    import ctypes

    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

    m = MEMORYSTATUSEX()
    m.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    used = m.ullTotalPhys - m.ullAvailPhys
    return {"total": m.ullTotalPhys, "used": used, "percent": pct(used, m.ullTotalPhys)}


def disk(mount):
    u = shutil.disk_usage(mount)
    return {"mount": mount, "total": u.total, "used": u.used, "percent": pct(u.used, u.total)}


def disks_linux():
    out, seen = [], set()
    with open("/proc/mounts") as f:
        for line in f:
            dev, mount, fs = line.split()[:3]
            mount = mount.replace("\\040", " ")
            if fs not in REAL_FS or dev in seen:
                continue
            if mount != "/" and mount.startswith(SKIP_PREFIXES):
                continue
            try:
                d = disk(mount)
            except OSError:
                continue
            if d["total"] >= MIN_SIZE:
                seen.add(dev)
                out.append(d)
    return sorted(out, key=lambda d: (d["mount"] != "/", d["mount"]))


def disks_windows():
    out = []
    for letter in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        root = f"{letter}:\\"
        if os.path.exists(root):
            try:
                d = disk(root)
            except OSError:
                continue
            if d["total"] >= MIN_SIZE:
                d["mount"] = f"{letter}:"
                out.append(d)
    return out


def stats():
    windows = sys.platform.startswith("win")
    try:
        ram = ram_windows() if windows else ram_linux()
    except Exception:
        ram = None
    try:
        disks = disks_windows() if windows else disks_linux()
    except Exception:
        disks = [disk("/")]
    return {"hostname": socket.gethostname(), "os": platform.system(), "ram": ram, "disks": disks}


# ---------------------------------------------------------------- Wallpaper Engine
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def steam_libraries():
    """Steam library folders on this computer."""
    roots = []
    if sys.platform.startswith("win"):
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as k:
                roots.append(winreg.QueryValueEx(k, "SteamPath")[0])
        except OSError:
            pass
        roots += [r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam"]
    else:
        roots += [os.path.expanduser("~/.steam/steam"), os.path.expanduser("~/.local/share/Steam")]
    libs = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        libs.append(root)
        vdf = os.path.join(root, "steamapps", "libraryfolders.vdf")
        try:
            with open(vdf, encoding="utf-8", errors="replace") as f:
                libs += [p.replace("\\\\", "\\") for p in re.findall(r'"path"\s+"([^"]+)"', f.read())]
        except OSError:
            pass
    seen, out = set(), []
    for lib in libs:
        key = os.path.normcase(os.path.normpath(lib))
        if key not in seen and os.path.isdir(lib):
            seen.add(key)
            out.append(lib)
    return out


def wallpaper_engine_dirs():
    env = os.environ.get("DESKBUDDY_WE_DIR")
    if env:
        return [env]
    return [d for d in (os.path.join(lib, "steamapps", "common", "wallpaper_engine") for lib in steam_libraries())
            if os.path.isfile(os.path.join(d, "config.json"))]


def selected_files(obj, found):
    """Every 'file' under a 'selectedwallpapers' block in Wallpaper Engine's config.json."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == "selectedwallpapers" and isinstance(value, dict):
                for monitor in value.values():
                    if isinstance(monitor, dict) and isinstance(monitor.get("file"), str):
                        found.append(monitor["file"])
            else:
                selected_files(value, found)
    elif isinstance(obj, list):
        for value in obj:
            selected_files(value, found)
    return found


def current_wallpaper():
    """The wallpaper on the first monitor (or DESKBUDDY_WE_MONITOR), or None."""
    for we in wallpaper_engine_dirs():
        try:
            with open(os.path.join(we, "config.json"), encoding="utf-8") as f:
                files = selected_files(json.load(f), [])
        except (OSError, ValueError):
            continue
        if not files:
            continue
        index = min(int(os.environ.get("DESKBUDDY_WE_MONITOR", "0")), len(files) - 1)
        folder = os.path.dirname(os.path.normpath(files[index]))
        project = {}
        try:
            with open(os.path.join(folder, "project.json"), encoding="utf-8") as f:
                project = json.load(f)
        except (OSError, ValueError):
            pass
        kind = str(project.get("type", "")).lower()
        main = os.path.join(folder, project.get("file") or os.path.basename(files[index]))
        preview = os.path.join(folder, project["preview"]) if project.get("preview") else None
        if not preview or not os.path.isfile(preview):
            previews = glob.glob(os.path.join(folder, "preview.*"))
            preview = previews[0] if previews else None
        if (kind == "video" or os.path.splitext(main)[1].lower() in VIDEO_EXTS) and os.path.isfile(main):
            path, wtype = main, "video"
        elif os.path.splitext(main)[1].lower() in IMAGE_EXTS and os.path.isfile(main):
            path, wtype = main, "image"
        elif preview:
            path, wtype = preview, "image"   # scene / web wallpapers: use the preview
        else:
            continue
        st = os.stat(path)
        return {
            "id": hashlib.sha1(f"{path}|{st.st_size}|{int(st.st_mtime)}".encode()).hexdigest()[:16],
            "title": project.get("title") or os.path.basename(folder),
            "type": wtype, "ext": os.path.splitext(path)[1].lower(), "size": st.st_size,
            "path": path, "preview": preview,
        }
    return None


class Handler(BaseHTTPRequestHandler):
    def send_file(self, path):
        try:
            size = os.path.getsize(path)
            f = open(path, "rb")
        except OSError:
            self.send_response(404)
            self.end_headers()
            return
        with f:
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.end_headers()
            shutil.copyfileobj(f, self.wfile, 1024 * 1024)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/wallpaper/"):
            wp = current_wallpaper()
            if not wp:
                self.send_response(404)
                self.end_headers()
                return
            if path == "/wallpaper/info":
                body = json.dumps({k: v for k, v in wp.items() if k not in ("path", "preview")} | {"hasPreview": bool(wp["preview"])}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/wallpaper/file":
                return self.send_file(wp["path"])
            if path == "/wallpaper/preview" and wp["preview"]:
                return self.send_file(wp["preview"])
            self.send_response(404)
            self.end_headers()
            return
        if path != "/stats":
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(stats()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")  # the dashboard reads it from the browser
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    print(f"DeskBuddy agent running on port {PORT}  (Ctrl+C to stop)")
    try:
        ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
