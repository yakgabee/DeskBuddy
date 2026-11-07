#!/usr/bin/env python3
"""DeskBuddy local server.

Serves the dashboard at http://127.0.0.1:9090/ (the address Spotify redirects
back to) and adds:

  GET /api/tailscale  ->  your tailnet's devices, from `tailscale status --json`
  GET /api/torrents   ->  your uTorrent downloads, via uTorrent's Web UI
  GET /api/weather    ->  current weather + today's high/low (OpenWeatherMap)
  GET /api/ping?host= ->  is a device on your home network online?
  GET /api/appletv?host=          ->  Apple TV: awake/asleep and what's playing
  GET /api/appletv/artwork?host=  ->  artwork for what's playing
  POST /api/appletv               ->  {"host", "action"}: play_pause, next, previous, turn_on, turn_off

Private settings (like your uTorrent password) go in local-settings.json next to
this file. It is git-ignored and never served to the browser.

It only listens on 127.0.0.1, so nothing else on your network can reach it.
"""
import base64
import concurrent.futures
import http.cookiejar
import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
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


# ---------- Weather (OpenWeatherMap) ----------
OWM_BASE = os.environ.get("DESKBUDDY_OWM_URL", "https://api.openweathermap.org")
GEO_URL = os.environ.get("DESKBUDDY_GEO_URL", "http://ip-api.com/json/?fields=status,city,lat,lon,countryCode")
WEATHER_TTL = 600  # seconds; keeps API use tiny


def fetch_json(url, timeout=6):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


class Weather:
    def __init__(self):
        self.lock = threading.Lock()
        self.cache = None       # (time, key, body)
        self.location = None    # auto-detected from this network's public IP

    def _where(self, cfg):
        if cfg.get("lat") is not None and cfg.get("lon") is not None:
            return {"lat": cfg["lat"], "lon": cfg["lon"]}, cfg.get("units")
        if cfg.get("city"):
            return {"q": cfg["city"]}, cfg.get("units")
        if not self.location:
            geo = fetch_json(GEO_URL)
            if geo.get("status") != "success":
                raise ValueError("location lookup failed")
            self.location = geo
        units = cfg.get("units") or ("imperial" if self.location.get("countryCode") in ("US", "LR", "MM") else "metric")
        return {"lat": self.location["lat"], "lon": self.location["lon"]}, units

    def status(self):
        cfg = local_settings().get("weather") or {}
        if not cfg.get("apiKey"):
            return 503, {"error": "not_set_up"}
        with self.lock:
            key = json.dumps(cfg, sort_keys=True)
            if self.cache and self.cache[1] == key and time.time() - self.cache[0] < WEATHER_TTL:
                return 200, self.cache[2]
            try:
                where, units = self._where(cfg)
                q = urllib.parse.urlencode({**where, "appid": cfg["apiKey"], "units": units or "metric"})
                now = fetch_json(f"{OWM_BASE}/data/2.5/weather?{q}")
                fc = fetch_json(f"{OWM_BASE}/data/2.5/forecast?{q}&cnt=8")
            except urllib.error.HTTPError as e:
                return 503, {"error": "bad_key" if e.code == 401 else "not_found" if e.code == 404 else "unreachable"}
            except (urllib.error.URLError, OSError, ValueError, KeyError):
                return 503, {"error": "unreachable"}
            # Today's high/low: current reading + forecast slots for the rest of today.
            tz = now.get("timezone", 0)
            today = time.gmtime(now["dt"] + tz)[:3]
            temps = [now["main"]["temp"]] + [x["main"]["temp"] for x in fc.get("list", [])
                                             if time.gmtime(x["dt"] + tz)[:3] == today]
            w = (now.get("weather") or [{}])[0]
            body = {
                "temp": round(now["main"]["temp"]),
                "feelsLike": round(now["main"].get("feels_like", now["main"]["temp"])),
                "high": round(max(temps)), "low": round(min(temps)),
                "condition": w.get("main", ""), "description": w.get("description", ""),
                "icon": w.get("icon", ""), "city": now.get("name", ""),
                "units": units or "metric",
            }
            self.cache = (time.time(), key, body)
            return 200, body


weather = Weather()


# ---------- Device online check (home network only) ----------
PROBE_PORTS = tuple(int(p) for p in os.environ.get(
    "DESKBUDDY_PROBE_PORTS", "445,139,135,3389,22,80,443,7000,62078,8080").split(","))  # common on PCs, Macs, Apple TVs


def home_network_host(host):
    """Only devices on your own network may be checked."""
    if host.endswith((".local", ".lan", ".home")):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or (ip.version == 4 and ip in ipaddress.ip_network("100.64.0.0/10"))


def ping(host):
    windows = sys.platform.startswith("win")
    cmd = ["ping", "-n", "1", "-w", "1000", host] if windows else ["ping", "-c", "1", "-W", "1", host]
    try:
        return subprocess.run(cmd, capture_output=True, timeout=3).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def tcp_open(host, port):
    try:
        with socket.create_connection((host, port), timeout=0.8):
            return True
    except OSError:
        return False


def device_status(host, extra_ports=()):
    if not host or not home_network_host(host):
        return 400, {"error": "not_allowed"}
    ports = list(dict.fromkeys([*extra_ports, *PROBE_PORTS]))
    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(ports) + 1) as pool:
        jobs = [pool.submit(ping, host)] + [pool.submit(tcp_open, host, p) for p in ports]
        online = False
        for job in concurrent.futures.as_completed(jobs):
            if job.result():
                online = True
                break
        ms = round((time.time() - t0) * 1000)
        for job in jobs:
            job.cancel()
    return 200, {"host": host, "online": online, "ms": ms if online else None}


# ---------- Apple TV (pyatv) ----------
_appletv = None


def appletv():
    global _appletv
    if _appletv is None:
        import appletv as mod  # appletv.py, next to this file
        _appletv = (mod, mod.AppleTVClient())
    return _appletv


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

    def addressed_to_us(self):
        # Only answer requests addressed to this dashboard. This blocks "DNS
        # rebinding", where a website points its own name at 127.0.0.1 to read
        # local pages.
        host = (self.headers.get("Host") or "").lower()
        return host in (f"{HOST}:{PORT}", f"localhost:{PORT}")

    def do_GET(self):
        if not self.addressed_to_us():
            return self.send_json(403, {"error": "forbidden"})
        path = self.path.split("?")[0]
        if path == "/api/tailscale":
            return self.send_json(*tailscale_status())
        if path == "/api/torrents":
            return self.send_json(*utorrent.status())
        if path == "/api/weather":
            return self.send_json(*weather.status())
        if path in ("/api/appletv", "/api/appletv/artwork"):
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            host = q.get("host", [""])[0].strip()
            if not host or not home_network_host(host):
                return self.send_json(400, {"error": "not_allowed"})
            mod, client = appletv()
            if path == "/api/appletv":
                return self.send_json(200, client.status(host))
            art = client.artwork_for(host, q.get("id", [""])[0])
            if not art:
                return self.send_json(404, {"error": "no_artwork"})
            data, mime = art
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Cache-Control", "max-age=3600")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if path == "/api/ping":
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            host = q.get("host", [""])[0].strip()
            ports = [int(p) for p in q.get("ports", [""])[0].split(",") if p.isdigit() and 0 < int(p) < 65536][:5]
            return self.send_json(*device_status(host, ports))
        if self.is_private():
            return self.send_json(404, {"error": "not_found"})
        super().do_GET()

    def do_POST(self):
        if not self.addressed_to_us():
            return self.send_json(403, {"error": "forbidden"})
        # Only the dashboard's own pages may send commands.
        origin = self.headers.get("Origin")
        if origin and origin.lower() not in (f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"):
            return self.send_json(403, {"error": "forbidden"})
        if self.path.split("?")[0] != "/api/appletv":
            return self.send_json(404, {"error": "not_found"})
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 10_000)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self.send_json(400, {"error": "bad_request"})
        mod, client = appletv()
        host, action = (body.get("host"), body.get("action")) if isinstance(body, dict) else (None, None)
        if not isinstance(host, str) or not home_network_host(host) or action not in mod.COMMANDS:
            return self.send_json(400, {"error": "bad_request"})
        result = client.command(host, action)
        self.send_json(200 if result.get("ok") else 503, result)

    def end_headers(self):
        # Always re-check the dashboard's own files, so a `git pull` takes effect
        # on the next reload instead of mixing old and new files.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


if __name__ == "__main__":
    print(f"DeskBuddy running at http://{HOST}:{PORT}/  (Ctrl+C to stop)")
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
