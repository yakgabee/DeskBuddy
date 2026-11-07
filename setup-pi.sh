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
  WX_KEY=$(ask "OpenWeatherMap API key (leave empty to skip weather)")
  UT_URL=$(ask "uTorrent Web UI address (leave empty to skip downloads)" "http://10.0.10.132:8080")
  UT_USER=""; UT_PASS=""
  if [ -n "$UT_URL" ]; then
    UT_USER=$(ask "uTorrent Web UI username" "gabe")
    read -r -s -p "  uTorrent Web UI password: " UT_PASS; echo
  fi
  WX_KEY="$WX_KEY" UT_URL="$UT_URL" UT_USER="$UT_USER" UT_PASS="$UT_PASS" python3 - <<'PY'
import json, os
s = {}
if os.environ["WX_KEY"]:
    s["weather"] = {"apiKey": os.environ["WX_KEY"]}
if os.environ["UT_URL"]:
    s["utorrent"] = {"url": os.environ["UT_URL"], "username": os.environ["UT_USER"], "password": os.environ["UT_PASS"]}
with open("local-settings.json", "w") as f:
    json.dump(s, f, indent=2)
PY
  chmod 600 local-settings.json
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

# ---------------------------------------------------------------- 3. Apple TV
bold "3. Apple TV (what's playing + remote buttons)"
if [ -x .venv/bin/python ] && .venv/bin/python -c "import pyatv" 2>/dev/null; then
  ok "pyatv is installed."
elif yesno "Install pyatv now? (takes a few minutes)"; then
  if ! python3 -m venv .venv 2>/dev/null; then
    warn "Installing python3-venv first…"; sudo apt-get install -y python3-venv && python3 -m venv .venv
  fi
  if .venv/bin/pip install -q --disable-pip-version-check pyatv; then ok "pyatv installed."
  else warn "pyatv install failed. Run: .venv/bin/pip install pyatv"; fi
fi
if [ -n "$ATV_HOST" ] && [ -x .venv/bin/python ] && .venv/bin/python -c "import pyatv" 2>/dev/null; then
  if yesno "Pair with the Apple TV at $ATV_HOST now? (turn the TV on first)"; then
    .venv/bin/python appletv.py pair "$ATV_HOST" || warn "Pairing didn't finish. Run ./setup-pi.sh again to retry."
  fi
fi

# ---------------------------------------------------------------- 4. Tailscale
bold "4. Tailscale (for the Tailscale tab)"
if command -v tailscale >/dev/null; then
  if tailscale status >/dev/null 2>&1; then ok "Tailscale is installed and signed in."
  elif yesno "Sign this Pi in to Tailscale now?"; then sudo tailscale up; fi
elif yesno "Install Tailscale on this Pi?"; then
  curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
fi

# ---------------------------------------------------------------- 5. Autostart
bold "5. Start DeskBuddy automatically when the Pi turns on"
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

# ---------------------------------------------------------------- 6. Screen on
bold "6. Keep the screen on (no blanking)"
if command -v raspi-config >/dev/null; then
  if sudo raspi-config nonint do_blanking 1; then ok "Screen blanking turned off."
  else warn "Couldn't change it. Use: sudo raspi-config → Display Options → Screen Blanking → No"; fi
else
  warn "raspi-config not found (not Raspberry Pi OS?), skipping."
fi

# ---------------------------------------------------------------- Checks
bold "Quick checks"
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
