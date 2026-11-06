#!/usr/bin/env python3
"""DeskBuddy local server.

Serves the dashboard at http://127.0.0.1:9090/ (the address Spotify redirects
back to) and adds:

  GET  /api/tailscale  ->  your tailnet's devices, from `tailscale status --json`
  GET  /api/light      ->  your Smart Life (Tuya) light's state
  POST /api/light      ->  change it: {"on": true, "brightness": 60, "color": "warm"}

The light is controlled directly over your home Wi-Fi with tinytuya, using the
devices.json / snapshot.json files that `python -m tinytuya wizard` creates in
this folder (see README). Those files hold your light's key and are git-ignored.

It only listens on 127.0.0.1, so nothing else on your network can reach it.
"""
import json
import os
import shutil
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST, PORT = "127.0.0.1", 9090
ROOT = os.path.dirname(os.path.abspath(__file__))

TAILSCALE_PATHS = [
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
    r"C:\Program Files\Tailscale\tailscale.exe",
    "/usr/bin/tailscale",
    "/usr/local/bin/tailscale",
]


def find_tailscale():
    found = shutil.which("tailscale")
    if found:
        return found
    return next((p for p in TAILSCALE_PATHS if os.path.exists(p)), None)


def node(n, me=False):
    last_seen = n.get("LastSeen") or ""
    return {
        "name": (n.get("DNSName") or "").split(".")[0] or n.get("HostName", "unknown"),
        "hostName": n.get("HostName", ""),
        "dnsName": (n.get("DNSName") or "").rstrip("."),
        "ips": n.get("TailscaleIPs") or [],
        "os": n.get("OS", ""),
        "online": bool(n.get("Online")) or me,
        "lastSeen": None if last_seen.startswith("0001") else last_seen,
        "active": bool(n.get("Active")),
        "direct": bool(n.get("CurAddr")),
        "relay": n.get("Relay", ""),
        "exitNode": bool(n.get("ExitNode")),
        "exitNodeOption": bool(n.get("ExitNodeOption")),
        "rxBytes": n.get("RxBytes", 0),
        "txBytes": n.get("TxBytes", 0),
        "self": me,
    }


def tailscale_status():
    exe = find_tailscale()
    if not exe:
        return 503, {"error": "not_installed"}
    try:
        out = subprocess.run([exe, "status", "--json"], capture_output=True, text=True, timeout=8)
        data = json.loads(out.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        return 503, {"error": "not_running"}
    if data.get("BackendState") != "Running":
        return 503, {"error": "not_running", "state": data.get("BackendState")}
    tailnet = data.get("CurrentTailnet") or {}
    peers = [node(p) for p in (data.get("Peer") or {}).values()]
    return 200, {
        "tailnet": tailnet.get("Name") or data.get("MagicDNSSuffix", ""),
        "version": (data.get("Version") or "").split("-")[0],
        "self": node(data.get("Self") or {}, me=True),
        "peers": sorted(peers, key=lambda p: (not p["online"], p["name"].lower())),
    }


# ---------- Smart light (Tuya / Smart Life, local control) ----------
LIGHT_CATEGORIES = {"dj", "dd", "fwd", "xdd", "dc", "fsd"}  # Tuya light categories
WHITES = {"warm": 0, "soft": 25, "daylight": 70, "cool": 100}  # colour temperature %
COLOURS = {
    "red": (255, 60, 60), "orange": (255, 120, 40), "green": (40, 210, 110),
    "blue": (60, 120, 255), "purple": (150, 90, 255), "pink": (255, 90, 170),
}
light_lock = threading.Lock()
PRIVATE_FILES = {"devices.json", "snapshot.json", "tinytuya.json", "tuya-raw.json"}


def read_json(name):
    try:
        with open(os.path.join(ROOT, name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def light_device():
    """Returns (device, info) or (None, error_code)."""
    try:
        import tinytuya
    except ImportError:
        return None, "no_tinytuya"
    devices = read_json("devices.json")
    if not devices:
        return None, "not_set_up"
    dev = next((d for d in devices if d.get("category") in LIGHT_CATEGORIES), devices[0])
    snap = read_json("snapshot.json") or {}
    found = next((d for d in snap.get("devices", []) if d.get("id") == dev.get("id")), {})
    ip = found.get("ip") or dev.get("ip")
    if not ip:
        return None, "not_found"
    bulb = tinytuya.BulbDevice(dev["id"], ip, dev["key"])
    bulb.set_version(float(found.get("ver") or dev.get("version") or 3.3))
    bulb.set_socketTimeout(3)
    return bulb, {"name": dev.get("name") or "Smart Light"}


def light_failed(result):
    return isinstance(result, dict) and "Error" in result


def light_state(bulb, info):
    st = bulb.state()
    if light_failed(st):
        return 503, {"connected": False, "error": "unreachable"}
    out = {"connected": True, "name": info["name"], "on": bool(st.get("is_on")), "mode": st.get("mode")}
    try:
        out["brightness"] = round(bulb.get_brightness_percentage())
    except Exception:
        pass
    return 200, out


def light_get():
    with light_lock:
        bulb, info = light_device()
        if not bulb:
            return 503, {"connected": False, "error": info}
        return light_state(bulb, info)


def light_set(changes):
    with light_lock:
        bulb, info = light_device()
        if not bulb:
            return 503, {"connected": False, "error": info}
        steps = []
        if changes.get("on") is False:
            steps.append(bulb.turn_off)
        else:
            if changes.get("on") is True:
                steps.append(bulb.turn_on)
            color, bright = changes.get("color"), changes.get("brightness")
            if color in WHITES:
                pct = bright if bright is not None else 100
                steps.append(lambda: bulb.set_white_percentage(pct, WHITES[color]))
            elif color in COLOURS:
                steps.append(lambda: bulb.set_colour(*COLOURS[color]))
                if bright is not None:
                    steps.append(lambda: bulb.set_brightness_percentage(bright))
            elif bright is not None:
                steps.append(lambda: bulb.set_brightness_percentage(bright))
        for step in steps:
            if light_failed(step()):
                return 503, {"connected": False, "error": "unreachable"}
        return light_state(bulb, info)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/tailscale":
            return self.send_json(*tailscale_status())
        if path == "/api/light":
            return self.send_json(*light_get())
        if os.path.basename(self.translate_path(self.path)) in PRIVATE_FILES:
            return self.send_json(404, {"error": "not_found"})  # never serve the light's keys
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/light":
            return self.send_json(404, {"error": "not_found"})
        # Only accept requests from the dashboard itself.
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{HOST}:{PORT}":
            return self.send_json(403, {"error": "forbidden"})
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 10_000)
            changes = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self.send_json(400, {"error": "bad_request"})
        if not isinstance(changes, dict):
            return self.send_json(400, {"error": "bad_request"})
        if "brightness" in changes:
            try:
                changes["brightness"] = max(1, min(100, int(changes["brightness"])))
            except (TypeError, ValueError):
                return self.send_json(400, {"error": "bad_request"})
        self.send_json(*light_set(changes))

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


if __name__ == "__main__":
    print(f"DeskBuddy running at http://{HOST}:{PORT}/  (Ctrl+C to stop)")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
