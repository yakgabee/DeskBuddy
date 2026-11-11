#!/usr/bin/env python3
"""DeskBuddy agent: reports this computer's RAM and storage to the dashboard.

Run it on the server you want to watch:

    python3 deskbuddy-agent.py            # listens on port 9091

Then GET http://<this-computer>:9091/stats returns, e.g.:

    {"hostname": "server", "ram": {"total": ..., "used": ..., "percent": 41.2},
     "disks": [{"mount": "/", "total": ..., "used": ..., "percent": 63.0}]}

It is read-only (it only reports numbers) and needs nothing but Python 3.
Works on Linux and Windows.
"""
import json
import os
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


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
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
