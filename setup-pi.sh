#!/usr/bin/env bash
# DeskBuddy setup for a Raspberry Pi. Run it from the DeskBuddy folder:
#
#     ./setup-pi.sh
#
# It asks before each step and is safe to run again (finished steps are skipped).
set -u
cd "$(dirname "$0")"
DIR=$(pwd)

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
ask()  { local a; read -r -p "  $1${2:+ [$2]}: " a; echo "${a:-${2:-}}"; }
yesno() { local a; read -r -p "  $1 [Y/n]: " a; [[ ! ${a:-} =~ ^[Nn] ]]; }
noyes() { local a; read -r -p "  $1 [y/N]: " a; [[ ${a:-} =~ ^[Yy] ]]; }

# Read a value from local-settings.json, e.g. setting wallpaper.agent
setting() { python3 -c 'import json,sys
v = json.load(open("local-settings.json"))
for k in sys.argv[1].split("."): v = v.get(k) if isinstance(v, dict) else None
print(v if isinstance(v, str) else "")' "$1" 2>/dev/null; }

# Update one section of local-settings.json (JSON from stdin; empty removes it), keeping the rest.
save_section() { SECTION="$1" python3 -c 'import json,os,sys
p = "local-settings.json"
try: s = json.load(open(p))
except Exception: s = {}
raw = sys.stdin.read().strip()
if raw: s[os.environ["SECTION"]] = json.loads(raw)
else: s.pop(os.environ["SECTION"], None)
json.dump(s, open(p, "w"), indent=2)'; chmod 600 local-settings.json; }

# DeskBuddy's own Python environment, for the extras (Apple TV, calendar).
ensure_venv() {
  [ -x .venv/bin/python ] && return 0
  if ! python3 -m venv .venv 2>/dev/null; then
    warn "Installing python3-venv first…"; sudo apt-get install -y python3-venv && python3 -m venv .venv
  fi
}

# Values from assets/config.js
ATV_HOST=$(grep -E "appletv: *true" assets/config.js | grep -oE "host: *'[^']+'" | grep -oE "[0-9.]+[0-9]" | head -1)
AGENT_URL=$(grep -B6 -E "type: *'agent'" -A2 assets/config.js | grep -oE "http://[0-9.]+:[0-9]+" | head -1)

echo "DeskBuddy setup — press Enter to accept the answer in [brackets]."

# ---------------------------------------------------------------- 1. Update
bold "1. Getting the latest DeskBuddy"
if [ -d .git ]; then
  if git pull --ff-only -q; then ok "Up to date ($(git log --oneline -1 | cut -c1-60))"
  else warn "Couldn't update automatically. Ask Claude if this keeps happening."; fi
else
  warn "Not a git folder, skipping update."
fi

# ---------------------------------------------------------------- 2. Settings
bold "2. Weather and uTorrent settings (saved only on this Pi)"
write_settings=1
if [ -f local-settings.json ]; then
  ok "local-settings.json already exists."
  yesno "Keep it as it is?" && write_settings=0
fi
if [ $write_settings = 1 ]; then
  # Current values (if any) are offered as defaults, so pressing Enter keeps them.
  OLD=(); [ -f local-settings.json ] && mapfile -t OLD < <(python3 -c '
import json
s = json.load(open("local-settings.json"))
w, u = s.get("weather") or {}, s.get("utorrent") or {}
for v in (w.get("apiKey", ""), u.get("url", ""), u.get("username", ""), u.get("password", ""), w.get("city", "")): print(v)' 2>/dev/null)
  WX_KEY=$(ask "OpenWeatherMap API key (type 'none' to turn weather off)" "${OLD[0]:-}")
  [ "$WX_KEY" = none ] && WX_KEY=""
  WX_CITY=""
  if [ -n "$WX_KEY" ]; then
    WX_CITY=$(ask "City for the weather, e.g. Austin,US (leave empty to detect it automatically)" "${OLD[4]:-}")
  fi
  UT_URL=$(ask "uTorrent Web UI address (type 'none' to turn downloads off)" "${OLD[1]:-http://10.0.10.132:8080}")
  [ "$UT_URL" = none ] && UT_URL=""
  UT_USER=""; UT_PASS=""
  if [ -n "$UT_URL" ]; then
    UT_USER=$(ask "uTorrent Web UI username" "${OLD[2]:-gabe}")
    if [ -n "${OLD[3]:-}" ]; then
      read -r -s -p "  uTorrent Web UI password (press Enter to keep the current one): " UT_PASS; echo
      UT_PASS=${UT_PASS:-${OLD[3]}}
    else
      read -r -s -p "  uTorrent Web UI password: " UT_PASS; echo
    fi
  fi
  WX_KEY="$WX_KEY" WX_CITY="$WX_CITY" python3 -c 'import json,os
k, c = os.environ["WX_KEY"], os.environ["WX_CITY"]
print(json.dumps({"apiKey": k, **({"city": c} if c else {})}) if k else "")' | save_section weather
  UT_URL="$UT_URL" UT_USER="$UT_USER" UT_PASS="$UT_PASS" python3 -c 'import json,os
u = os.environ["UT_URL"]
print(json.dumps({"url": u, "username": os.environ["UT_USER"], "password": os.environ["UT_PASS"]}) if u else "")' | save_section utorrent
  ok "Saved local-settings.json"
fi
if [ -f local-settings.json ] && grep -q '"utorrent"' local-settings.json; then
  mapfile -t UT < <(python3 -c 'import json; u=json.load(open("local-settings.json"))["utorrent"]; print(u["url"]); print(u["username"]); print(u["password"])')
  UT_URL=${UT[0]}
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 -u "${UT[1]}:${UT[2]}" "$UT_URL/gui/token.html")
  case $code in
    200) ok "uTorrent answers." ;;
    401) warn "uTorrent rejected the username or password." ;;
    400) warn "uTorrent refused this Pi. Add this Pi's IP ($(hostname -I | awk '{print $1}')) to uTorrent's Web UI whitelist." ;;
    *)   warn "Can't reach uTorrent at $UT_URL. Is it open with the Web UI on (and allowed through Windows Firewall)?" ;;
  esac
fi

# ---------------------------------------------------------------- 3. Wallpaper
bold "3. Wallpaper (your Wallpaper Engine wallpaper, from your PC)"
WP=$(setting wallpaper.agent)
if [ -z "$WP" ] || noyes "Wallpaper comes from $WP. Change it?"; then
  WP=$(ask "Address of the DeskBuddy helper on your PC (type 'none' to skip)" "${WP:-http://10.0.10.132:9091}")
  [ "$WP" = none ] && WP=""
  WP="$WP" python3 -c 'import json,os; a=os.environ["WP"].rstrip("/"); print(json.dumps({"agent": a}) if a else "")' | save_section wallpaper
fi
if [ -n "$WP" ]; then
  info=$(curl -s -m 5 -w '\n%{http_code}' "$WP/wallpaper/info")
  case ${info##*$'\n'} in
    200) ok "Found your wallpaper: $(echo "${info%$'\n'*}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("title","?"))')" ;;
    404) warn "The PC helper answers, but no Wallpaper Engine wallpaper was found. Is Wallpaper Engine running?" ;;
    *)   warn "Can't reach the PC helper at $WP. On your PC, run agent\\install-windows.bat (see README)." ;;
  esac
  if ! command -v ffmpeg >/dev/null && yesno "Install ffmpeg? (shrinks video wallpapers so they play smoothly)"; then
    sudo apt-get install -y ffmpeg >/dev/null && ok "ffmpeg installed."
  fi
fi

# ---------------------------------------------------------------- 4. Calendar
bold "4. Calendar (iCloud)"
ICLOUD_USER=$(setting calendar.icloud.username)
if [ -z "$ICLOUD_USER" ] || noyes "Calendar is connected to $ICLOUD_USER. Change it?"; then
  echo "  iCloud needs an app-specific password: appleid.apple.com → Sign-In and Security →"
  echo "  App-Specific Passwords → +. (Your normal Apple ID password won't work.)"
  ICLOUD_USER=$(ask "Apple ID email (type 'none' to skip the calendar)" "$ICLOUD_USER")
  [ "$ICLOUD_USER" = none ] && ICLOUD_USER=""
  if [ -n "$ICLOUD_USER" ]; then
    OLD_PW=$(setting calendar.icloud.appPassword)
    read -r -s -p "  App-specific password${OLD_PW:+ (press Enter to keep the current one)}: " ICLOUD_PW; echo
    ICLOUD_PW=${ICLOUD_PW:-$OLD_PW}
    CALS=$(ask "Only these calendars, comma-separated (leave empty for all)" "")
  fi
  ICLOUD_USER="$ICLOUD_USER" ICLOUD_PW="${ICLOUD_PW:-}" CALS="${CALS:-}" python3 -c 'import json,os
u = os.environ["ICLOUD_USER"]
inc = [c.strip() for c in os.environ["CALS"].split(",") if c.strip()]
print(json.dumps({"icloud": {"username": u, "appPassword": os.environ["ICLOUD_PW"]}, **({"include": inc} if inc else {})}) if u else "")' | save_section calendar
fi
if [ -n "$ICLOUD_USER" ]; then
  if ! { [ -x .venv/bin/python ] && .venv/bin/python -c "import icalendar, recurring_ical_events" 2>/dev/null; }; then
    ensure_venv && .venv/bin/pip install -q --disable-pip-version-check icalendar recurring_ical_events && ok "Calendar support installed."
  fi
  result=$(.venv/bin/python -c '
import json, calendar_sync as c
try: print("ok", len(c.upcoming(json.load(open("local-settings.json"))["calendar"])))
except c.AuthFailed: print("auth")
except Exception as e: print("error")' 2>/dev/null)
  case $result in
    ok*)  ok "Calendar connected (${result#ok } upcoming events)." ;;
    auth) warn "iCloud didn't accept that Apple ID / app-specific password." ;;
    *)    warn "Couldn't read the calendar right now. Check the Pi's internet connection." ;;
  esac
fi

# ---------------------------------------------------------------- 5. Apple TV
bold "5. Apple TV (what's playing + remote buttons)"
# srptools 2.x breaks pyatv's pairing ("SRPClientSession.__init__() takes 2
# positional arguments"), so keep it below 2 until pyatv is updated.
if [ -x .venv/bin/python ] && .venv/bin/python -c "import pyatv" 2>/dev/null; then
  if .venv/bin/python -c "import importlib.metadata as m, sys; sys.exit(int(m.version('srptools').split('.')[0]) < 2)" 2>/dev/null; then
    warn "Fixing a library version that breaks Apple TV pairing…"
    .venv/bin/pip install -q --disable-pip-version-check "srptools<2" && ok "Fixed."
  fi
  ok "pyatv is installed."
elif yesno "Install pyatv now? (takes a few minutes)"; then
  ensure_venv
  if .venv/bin/pip install -q --disable-pip-version-check pyatv "srptools<2"; then ok "pyatv installed."
  else warn "pyatv install failed. Run: .venv/bin/pip install pyatv"; fi
fi
if [ -n "$ATV_HOST" ] && [ -x .venv/bin/python ] && .venv/bin/python -c "import pyatv" 2>/dev/null; then
  if yesno "Pair with the Apple TV at $ATV_HOST now? (turn the TV on first)"; then
    .venv/bin/python appletv.py pair "$ATV_HOST" || warn "Pairing didn't finish. Run ./setup-pi.sh again to retry."
  fi
fi

# ---------------------------------------------------------------- 6. Tailscale
bold "6. Tailscale (for the Tailscale tab)"
if command -v tailscale >/dev/null; then
  if tailscale status >/dev/null 2>&1; then ok "Tailscale is installed and signed in."
  elif yesno "Sign this Pi in to Tailscale now?"; then sudo tailscale up; fi
elif yesno "Install Tailscale on this Pi?"; then
  curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
fi

# ---------------------------------------------------------------- 7. Autostart
bold "7. Start DeskBuddy automatically when the Pi turns on"
LINE="$DIR/kiosk.sh &"
added=0
mkdir -p "$HOME/.config/labwc"
if ! grep -qF "$DIR/kiosk.sh" "$HOME/.config/labwc/autostart" 2>/dev/null; then
  echo "$LINE" >> "$HOME/.config/labwc/autostart"; added=1
fi
if [ -f "$HOME/.config/wayfire.ini" ] && ! grep -qF "$DIR/kiosk.sh" "$HOME/.config/wayfire.ini"; then
  printf '\n[autostart]\ndeskbuddy = %s/kiosk.sh\n' "$DIR" >> "$HOME/.config/wayfire.ini"; added=1   # older Pi OS
fi
if [ -d "$HOME/.config/lxsession/LXDE-pi" ] && ! grep -qF "$DIR/kiosk.sh" "$HOME/.config/lxsession/LXDE-pi/autostart" 2>/dev/null; then
  echo "@$DIR/kiosk.sh" >> "$HOME/.config/lxsession/LXDE-pi/autostart"; added=1                   # X11 desktop
fi
[ $added = 1 ] && ok "Added." || ok "Already set up."

# ---------------------------------------------------------------- 8. Screen on
bold "8. Keep the screen on (no blanking)"
if command -v raspi-config >/dev/null; then
  if sudo raspi-config nonint do_blanking 1; then ok "Screen blanking turned off."
  else warn "Couldn't change it. Use: sudo raspi-config → Display Options → Screen Blanking → No"; fi
else
  warn "raspi-config not found (not Raspberry Pi OS?), skipping."
fi

# ---------------------------------------------------------------- Checks
bold "Quick checks"
WX=$(python3 -c 'import json; print((json.load(open("local-settings.json")).get("weather") or {}).get("apiKey", ""))' 2>/dev/null)
if [ -n "$WX" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 8 "https://api.openweathermap.org/data/2.5/weather?lat=0&lon=0&appid=$WX")
  case $code in
    200) ok "Weather key works." ;;
    401) warn "OpenWeatherMap doesn't accept the weather key yet. New keys can take up to 2 hours; also check it's typed right." ;;
    *)   warn "Couldn't reach OpenWeatherMap (code $code)." ;;
  esac
else
  warn "No weather key saved, so the weather won't show. Run ./setup-pi.sh again and enter it."
fi
if [ -n "$AGENT_URL" ]; then
  if curl -s -m 4 "$AGENT_URL/stats" | grep -q '"ram"'; then ok "Local Server helper answers ($AGENT_URL)."
  else warn "Local Server helper isn't answering at $AGENT_URL. On that server, run: sudo bash install.sh (in DeskBuddy/agent)"; fi
fi
if [ -n "$ATV_HOST" ]; then
  ping -c 1 -W 2 "$ATV_HOST" >/dev/null 2>&1 && ok "Apple TV answers ($ATV_HOST)." || warn "Apple TV at $ATV_HOST didn't answer a ping (it may just be asleep)."
fi

# ---------------------------------------------------------------- Done
bold "Almost done! A few things only you can do:"
echo "  • After the restart, tap 'Connect Spotify' on the screen and log in."
echo "  • uTorrent on your PC: Web UI on, port 8080, and allow this Pi's IP ($(hostname -I 2>/dev/null | awk '{print $1}'))."
echo "  • Spotify developer dashboard: Redirect URI is http://127.0.0.1:9090/ and reset the Client Secret."
echo "  • Local Server: run agent/install.sh there (see README) if the check above failed."
echo
if yesno "Restart the Pi now to start DeskBuddy?"; then sudo reboot; else echo "  Start it any time with: $DIR/kiosk.sh"; fi
