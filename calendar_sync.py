"""Calendar support for DeskBuddy: iCloud (CalDAV) and calendar links (.ics / webcal).

server.py uses this for GET /api/calendar. Settings live in local-settings.json:

    "calendar": {
      "icloud": {"username": "you@icloud.com", "appPassword": "abcd-efgh-ijkl-mnop"},
      "include": ["Home", "Work"],          # optional: only these calendars
      "urls": ["webcal://p01-caldav.icloud.com/published/2/..."],   # optional
      "days": 14                             # optional: how far ahead to show
    }

iCloud needs an app-specific password (appleid.apple.com → Sign-In and Security →
App-Specific Passwords), not your normal Apple ID password.

Needs the small libraries icalendar and recurring_ical_events (setup-pi.sh installs
them into .venv).
"""
import base64
import datetime as dt
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ICLOUD_URL = "https://caldav.icloud.com/"
NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav", "a": "http://apple.com/ns/ical/"}


class NotInstalled(Exception):
    pass


class AuthFailed(Exception):
    pass


class Unreachable(Exception):
    pass


def _libs():
    try:
        import icalendar
        import recurring_ical_events
    except ImportError:
        raise NotInstalled()
    return icalendar, recurring_ical_events


# ---------------------------------------------------------------- CalDAV over plain HTTP
class CalDAV:
    def __init__(self, url, username, password, timeout=15):
        self.base = url
        self.auth = "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()
        self.timeout = timeout

    def request(self, method, url, body, depth):
        for _ in range(4):  # follow redirects (iCloud sends you to your own pXX server)
            req = urllib.request.Request(url, data=body.encode(), method=method, headers={
                "Authorization": self.auth, "Depth": str(depth),
                "Content-Type": "application/xml; charset=utf-8", "User-Agent": "DeskBuddy",
            })
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return r.geturl(), ET.fromstring(r.read())
            except urllib.error.HTTPError as e:
                if e.code in (301, 302, 307, 308) and e.headers.get("Location"):
                    url = urllib.parse.urljoin(url, e.headers["Location"])
                    continue
                if e.code in (401, 403):
                    raise AuthFailed()
                raise Unreachable()
            except (urllib.error.URLError, OSError, ET.ParseError):
                raise Unreachable()
        raise Unreachable()

    def _href(self, root, base, path):
        el = root.find(path, NS)
        return urllib.parse.urljoin(base, el.text.strip()) if el is not None and el.text else None

    def calendars(self):
        """[(url, name, color)] for every calendar that holds events."""
        url, root = self.request("PROPFIND", self.base,
            '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', 0)
        principal = self._href(root, url, ".//d:current-user-principal/d:href") or url
        url, root = self.request("PROPFIND", principal,
            '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
            '<d:prop><c:calendar-home-set/></d:prop></d:propfind>', 0)
        home = self._href(root, url, ".//c:calendar-home-set/d:href") or url
        url, root = self.request("PROPFIND", home,
            '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">'
            '<d:prop><d:resourcetype/><d:displayname/><a:calendar-color/><c:supported-calendar-component-set/></d:prop>'
            '</d:propfind>', 1)
        out = []
        for resp in root.findall("d:response", NS):
            if resp.find(".//d:resourcetype/c:calendar", NS) is None:
                continue
            comps = [c.get("name") for c in resp.findall(".//c:supported-calendar-component-set/c:comp", NS)]
            if comps and "VEVENT" not in comps:
                continue  # reminders-only lists
            href = urllib.parse.urljoin(url, resp.find("d:href", NS).text.strip())
            name = (resp.findtext(".//d:displayname", "", NS) or "").strip() or "Calendar"
            color = (resp.findtext(".//a:calendar-color", "", NS) or "").strip()[:7] or None
            out.append((href, name, color))
        return out

    def events_ics(self, cal_url, start, end):
        fmt = "%Y%m%dT%H%M%SZ"
        body = ('<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
                '<d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR">'
                '<c:comp-filter name="VEVENT">'
                f'<c:time-range start="{start.strftime(fmt)}" end="{end.strftime(fmt)}"/>'
                '</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>')
        _, root = self.request("REPORT", cal_url, body, 1)
        return [el.text for el in root.findall(".//c:calendar-data", NS) if el.text]


# ---------------------------------------------------------------- parsing
def _local(value):
    """iCalendar date/datetime -> (local naive datetime, all_day)."""
    if isinstance(value, dt.datetime):
        if value.tzinfo is not None:
            value = value.astimezone().replace(tzinfo=None)
        return value, False
    return dt.datetime.combine(value, dt.time()), True


def parse_events(ics_texts, start, end, calendar, color):
    icalendar, recurring = _libs()
    out = []
    for text in ics_texts:
        try:
            cal = icalendar.Calendar.from_ical(text)
            for ev in recurring.of(cal).between(start, end):
                if str(ev.get("STATUS", "")).upper() == "CANCELLED" or "DTSTART" not in ev:
                    continue
                s, all_day = _local(ev["DTSTART"].dt)
                e = _local(ev["DTEND"].dt)[0] if "DTEND" in ev else s + (dt.timedelta(days=1) if all_day else dt.timedelta(hours=1))
                out.append({
                    "title": str(ev.get("SUMMARY", "")).strip() or "(No title)",
                    "start": s.isoformat(timespec="minutes"), "end": e.isoformat(timespec="minutes"),
                    "allDay": all_day, "location": str(ev.get("LOCATION", "")).strip() or None,
                    "calendar": calendar, "color": color,
                })
        except Exception:
            continue  # skip anything malformed rather than failing the whole calendar
    return out


def fetch_url(url, timeout=15):
    url = "https://" + url[len("webcal://"):] if url.startswith("webcal://") else url
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DeskBuddy"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise AuthFailed()
        raise Unreachable()
    except (urllib.error.URLError, OSError):
        raise Unreachable()


def upcoming(cfg, now=None):
    """Events from now through cfg['days'] days ahead, sorted by start."""
    _libs()
    now = now or dt.datetime.now()
    start = dt.datetime.combine(now.date(), dt.time())
    end = start + dt.timedelta(days=int(cfg.get("days") or 14))
    include = set(cfg.get("include") or [])
    events = []
    icloud = cfg.get("icloud") or {}
    if icloud.get("username") and icloud.get("appPassword"):
        dav = CalDAV(icloud.get("url") or ICLOUD_URL, icloud["username"], icloud["appPassword"])
        utc_start = start.astimezone(dt.timezone.utc)
        utc_end = end.astimezone(dt.timezone.utc)
        for cal_url, name, color in dav.calendars():
            if include and name not in include:
                continue
            events += parse_events(dav.events_ics(cal_url, utc_start, utc_end), start, end, name, color)
    icalendar, _ = _libs()
    for url in cfg.get("urls") or []:
        text = fetch_url(url)
        try:
            name = str(icalendar.Calendar.from_ical(text).get("X-WR-CALNAME", "")) or "Calendar"
        except Exception:
            name = "Calendar"
        events += parse_events([text], start, end, name, None)
    # Drop events that already ended today; keep all-day events for today.
    now_iso = now.isoformat(timespec="minutes")
    events = [e for e in events if e["allDay"] or e["end"] > now_iso]
    events.sort(key=lambda e: (e["start"][:10], not e["allDay"], e["start"], e["title"].lower()))
    return events
