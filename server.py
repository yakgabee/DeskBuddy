#!/usr/bin/env python3
"""DeskBuddy local server.

Serves the dashboard at http://127.0.0.1:9090/ (the address Spotify redirects
back to) and adds:

  GET /api/tailscale  ->  your tailnet's devices, from `tailscale status --json`
  GET /api/torrents   ->  your uTorrent downloads, via uTorrent's Web UI

Private settings (like your uTorrent password) go in local-settings.json next to
this file. It is git-ignored and never served to the browser.

It only listens on 127.0.0.1, so nothing else on your network can reach it.
"""
import base64
import http.cookiejar
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
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


PRIVATE_FILES = {"local-settings.json"}


def local_settings():
    try:
        with open(os.path.join(ROOT, "local-settings.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


# ---------- uTorrent (classic) Web UI ----------
class WebUIRefused(Exception):
    """uTorrent answered but refused the request (token check problem)."""


class UTorrent:
    """Talks to uTorrent's Web UI API: get a token, then list torrents."""

    # uTorrent status bit flags
    STARTED, CHECKING, ERROR, PAUSED, QUEUED = 1, 2, 16, 32, 64

    def __init__(self):
        self.lock = threading.Lock()
        self.token = None
        self.key = None
        self.opener = None

    def _setup(self, cfg):
        key = (cfg["url"], cfg.get("username"), cfg.get("password"))
        if key != self.key:
            self.key, self.token = key, None
            self.opener = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        auth = base64.b64encode(f"{cfg.get('username', '')}:{cfg.get('password', '')}".encode()).decode()
        self.opener.addheaders = [("Authorization", f"Basic {auth}")]

    def _get(self, url):
        with self.opener.open(url, timeout=5) as r:
            return r.read().decode("utf-8", "replace")

    def _list(self, base):
        # Most setups need a token from /gui/token.html first. If uTorrent's
        # token check is turned off (webui.token_auth = false), that page answers
        # "invalid request" and the list works without one.
        if self.token is None:
            try:
                m = re.search(r">([^<]+)</div>", self._get(f"{base}/gui/token.html"))
                self.token = m.group(1) if m else ""
            except urllib.error.HTTPError as e:
                if e.code == 401:
                    raise
                self.token = ""
        params = {"list": 1}
        if self.token:
            params["token"] = self.token
        try:
            return json.loads(self._get(f"{base}/gui/?{urllib.parse.urlencode(params)}"))
        except urllib.error.HTTPError as e:
            if e.code == 400 and not self.token:
                raise WebUIRefused() from e
            raise

    @classmethod
    def state(cls, t):
        status, pct, msg = t[1], t[4], (t[21] if len(t) > 21 else "") or ""
        if status & cls.ERROR:
            return "error", msg or "Error"
        if status & cls.CHECKING:
            return "checking", "Checking"
        if status & cls.PAUSED:
            return "paused", "Paused"
        if pct >= 1000:
            return ("seeding", "Seeding") if status & cls.STARTED else ("finished", "Finished")
        if status & cls.STARTED:
            return ("downloading", "Downloading") if t[9] > 0 else ("stalled", "Waiting for peers")
        if status & cls.QUEUED:
            return "queued", "Queued"
        return "stopped", "Stopped"

    @classmethod
    def torrent(cls, t):
        state, label = cls.state(t)
        return {
            "id": t[0], "name": t[2], "size": t[3], "progress": t[4] / 10,
            "downloaded": t[5], "uploaded": t[6], "upSpeed": t[8], "downSpeed": t[9],
            "eta": t[10] if t[10] > 0 else None, "label": t[11],
            "seeds": t[14], "peers": t[12], "remaining": t[18],
            "addedOn": t[23] if len(t) > 23 else None,
            "state": state, "stateText": label,
        }

    def status(self):
        cfg = local_settings().get("utorrent")
        if not cfg or not cfg.get("url"):
            return 503, {"connected": False, "error": "not_set_up"}
        base = cfg["url"].rstrip("/")
        with self.lock:
            self._setup(cfg)
            for attempt in range(2):
                try:
                    data = self._list(base)
                    break
                except WebUIRefused:
                    self.token = None
                    return 503, {"connected": False, "error": "refused"}
                except urllib.error.HTTPError as e:
                    self.token = None
                    if e.code == 401:
                        return 503, {"connected": False, "error": "auth"}
                    if attempt:
                        return 503, {"connected": False, "error": "unreachable"}
                except (urllib.error.URLError, OSError, ValueError):
                    self.token = None
                    if attempt:
                        return 503, {"connected": False, "error": "unreachable"}
        torrents = [self.torrent(t) for t in data.get("torrents", [])]
        torrents.sort(key=lambda t: (t["state"] not in ("downloading", "stalled"), -(t["addedOn"] or 0)))
        return 200, {
            "connected": True,
            "torrents": torrents,
            "downSpeed": sum(t["downSpeed"] for t in torrents),
            "upSpeed": sum(t["upSpeed"] for t in torrents),
        }


utorrent = UTorrent()


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

    def is_private(self):
        # Hidden files/folders (.git …) and private settings are never served.
        rel = os.path.relpath(self.translate_path(self.path), ROOT)
        parts = rel.replace("\\", "/").split("/")
        return any(p.startswith(".") and p not in (".", "..") for p in parts) or \
            parts[-1].lower() in PRIVATE_FILES

    def do_GET(self):
        # Only answer requests addressed to this dashboard. This blocks "DNS
        # rebinding", where a website points its own name at 127.0.0.1 to read
        # local pages.
        host = (self.headers.get("Host") or "").lower()
        if host not in (f"{HOST}:{PORT}", f"localhost:{PORT}"):
            return self.send_json(403, {"error": "forbidden"})
        path = self.path.split("?")[0]
        if path == "/api/tailscale":
            return self.send_json(*tailscale_status())
        if path == "/api/torrents":
            return self.send_json(*utorrent.status())
        if self.is_private():
            return self.send_json(404, {"error": "not_found"})
        super().do_GET()

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


if __name__ == "__main__":
    print(f"DeskBuddy running at http://{HOST}:{PORT}/  (Ctrl+C to stop)")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
