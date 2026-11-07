#!/usr/bin/env python3
"""Apple TV support for DeskBuddy, using pyatv (https://pyatv.dev).

server.py uses this to show whether the Apple TV is awake, what's playing (with
artwork), and to send play/pause, skip and power commands.

Pair once (the Apple TV shows a code on screen):

    .venv/bin/python appletv.py pair 10.0.10.118

Credentials are saved in ~/.pyatv.conf on this computer.
"""
import asyncio
import sys
import threading
import time

try:
    import pyatv
    from pyatv import const
    from pyatv.storage.file_storage import FileStorage
except ImportError:  # pyatv not installed: the dashboard says how to install it
    pyatv = None

# Protocols that must be paired for status and control on current tvOS.
PAIR_PROTOCOLS = ("Companion", "AirPlay")
RETRY_AFTER_FAILURE = 20  # seconds before trying to reconnect to an unreachable Apple TV


class NotPaired(Exception):
    pass


class Unreachable(Exception):
    pass


def needs_pairing(conf):
    """Protocols the Apple TV requires pairing for that have no saved credentials."""
    missing = []
    for service in conf.services:
        if service.protocol.name in PAIR_PROTOCOLS and not service.credentials \
                and service.pairing == const.PairingRequirement.Mandatory:
            missing.append(service.protocol.name)
    return missing


class AppleTVClient:
    """Keeps one connection to the Apple TV open on a background event loop."""

    def __init__(self):
        self.loop = asyncio.new_event_loop()
        threading.Thread(target=self.loop.run_forever, daemon=True).start()
        self.atv = None
        self.host = None
        self.lock = None
        self.failed_at = {}     # host -> (time, state) of the last failed connect
        self.artwork = None     # (artwork_id, bytes, mimetype)

    # Called by pyatv when the connection drops.
    def connection_lost(self, exception):
        self.atv = None

    def connection_closed(self):
        self.atv = None

    def run(self, coro, timeout=20):
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout)

    async def _connect(self, host):
        if self.atv and self.host == host:
            return self.atv
        failed = self.failed_at.get(host)
        if failed and time.time() - failed[0] < RETRY_AFTER_FAILURE:
            raise failed[1]()
        await self._disconnect()
        try:
            storage = FileStorage.default_storage(self.loop)
            await storage.load()
            confs = await pyatv.scan(self.loop, hosts=[host], timeout=5, storage=storage)
            if not confs:
                raise Unreachable()
            if needs_pairing(confs[0]):
                raise NotPaired()
            self.atv = await pyatv.connect(confs[0], self.loop, storage=storage)
        except (NotPaired, Unreachable) as e:
            self.failed_at[host] = (time.time(), type(e))
            raise
        except Exception:
            self.failed_at[host] = (time.time(), Unreachable)
            raise Unreachable()
        self.atv.listener = self
        self.host = host
        self.failed_at.pop(host, None)
        return self.atv

    async def _disconnect(self):
        if self.atv:
            try:
                await asyncio.gather(*self.atv.close(), return_exceptions=True)
            except Exception:
                pass
        self.atv = None

    async def _locked(self, fn):
        if self.lock is None:
            self.lock = asyncio.Lock()
        async with self.lock:
            return await fn()

    # ---------- status ----------
    async def _status(self, host):
        try:
            atv = await self._connect(host)
        except NotPaired:
            return {"state": "not_paired"}
        except Unreachable:
            return {"state": "unreachable"}
        out = {"state": "ok", "power": "unknown"}
        try:
            out["power"] = {const.PowerState.On: "on", const.PowerState.Off: "off"}.get(atv.power.power_state, "unknown")
        except Exception:
            pass
        try:
            app = atv.metadata.app
            out["app"] = app.name if app else None
        except Exception:
            out["app"] = None
        try:
            p = await atv.metadata.playing()
        except Exception:
            # The connection went stale; reconnect on the next request.
            await self._disconnect()
            return {"state": "unreachable"}
        state = {
            const.DeviceState.Playing: "playing", const.DeviceState.Paused: "paused",
            const.DeviceState.Loading: "loading", const.DeviceState.Seeking: "playing",
        }.get(p.device_state, "idle")
        media = {const.MediaType.Video: "video", const.MediaType.Music: "music", const.MediaType.TV: "tv"}.get(p.media_type, "unknown")
        out.update({
            "deviceState": state, "mediaType": media,
            "title": p.title, "artist": p.artist, "album": p.album,
            "series": p.series_name, "season": p.season_number, "episode": p.episode_number,
            "position": p.position, "total": p.total_time,
        })
        try:
            out["artworkId"] = atv.metadata.artwork_id if state != "idle" else None
        except Exception:
            out["artworkId"] = None
        return out

    def status(self, host):
        if pyatv is None:
            return {"state": "not_installed"}
        try:
            return self.run(self._locked(lambda: self._status(host)))
        except Exception:
            return {"state": "unreachable"}

    # ---------- artwork ----------
    async def _artwork(self, host, artwork_id):
        if self.artwork and self.artwork[0] == artwork_id:
            return self.artwork[1:]
        atv = await self._connect(host)
        art = await atv.metadata.artwork(width=600)
        if not art or not art.bytes:
            return None
        self.artwork = (artwork_id, art.bytes, art.mimetype or "image/jpeg")
        return self.artwork[1:]

    def artwork_for(self, host, artwork_id):
        if pyatv is None:
            return None
        try:
            return self.run(self._locked(lambda: self._artwork(host, artwork_id)))
        except Exception:
            return None

    # ---------- commands ----------
    async def _command(self, host, action):
        atv = await self._connect(host)
        rc, power = atv.remote_control, atv.power
        await {
            "play_pause": rc.play_pause, "next": rc.next, "previous": rc.previous,
            "turn_on": power.turn_on, "turn_off": power.turn_off,
        }[action]()

    def command(self, host, action):
        if pyatv is None:
            return {"error": "not_installed"}
        try:
            self.run(self._locked(lambda: self._command(host, action)))
            return {"ok": True}
        except NotPaired:
            return {"error": "not_paired"}
        except Exception:
            return {"error": "failed"}


COMMANDS = {"play_pause", "next", "previous", "turn_on", "turn_off"}


# ---------- one-time pairing (run from a terminal) ----------
async def pair(host):
    loop = asyncio.get_running_loop()
    storage = FileStorage.default_storage(loop)
    await storage.load()
    print(f"Looking for the Apple TV at {host}…")
    confs = await pyatv.scan(loop, hosts=[host], timeout=10, storage=storage)
    if not confs:
        print("No Apple TV found at that address. Is it on and on the same network?")
        return 1
    conf = confs[0]
    todo = needs_pairing(conf)
    if not todo:
        print(f"Already paired with {conf.name}. You're all set.")
        return 0
    for name in todo:
        protocol = getattr(const.Protocol, name)
        print(f"\nPairing {name} with {conf.name}…")
        pairing = await pyatv.pair(conf, protocol, loop, storage=storage, name="DeskBuddy")
        try:
            await pairing.begin()
            if pairing.device_provides_pin:
                pin = await loop.run_in_executor(None, input, "Enter the code shown on the TV: ")
                pairing.pin(pin.strip())
            else:
                pairing.pin(1234)
                print('Enter 1234 on the TV if asked, then press Enter here.')
                await loop.run_in_executor(None, sys.stdin.readline)
            await pairing.finish()
            if not pairing.has_paired:
                print(f"{name} pairing failed. Run this again to retry.")
                return 2
            print(f"{name} paired.")
        finally:
            await pairing.close()
    await storage.save()
    print("\nDone! Restart DeskBuddy and the Apple TV will show up on the dashboard.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "pair":
        print("Usage: python appletv.py pair <apple-tv-ip>")
        sys.exit(1)
    if pyatv is None:
        print("pyatv isn't installed. See 'Apple TV' in the README.")
        sys.exit(1)
    sys.exit(asyncio.run(pair(sys.argv[2])))
