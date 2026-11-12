#!/usr/bin/env sh
# Raspberry Pi / Linux: start DeskBuddy and open it full-screen (kiosk mode).
# Exit kiosk mode with Alt+F4. The mouse pointer is hidden on the dashboard.
# Running it again restarts everything, so updates (git pull) always show.
cd "$(dirname "$0")"
DIR=$(pwd)

# Use DeskBuddy's own Python environment (.venv, for extras like pyatv) if it exists.
PY=python3; [ -x .venv/bin/python3 ] && PY=.venv/bin/python3

up() { python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9090/', timeout=1)" 2>/dev/null; }

# Close a DeskBuddy window that's already open, and stop this folder's server,
# so the latest code is used.
pkill -f -- "--kiosk .*127\.0\.0\.1:9090" 2>/dev/null
for pid in $(pgrep -f "server.py" 2>/dev/null); do
  [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$DIR" ] && kill "$pid" 2>/dev/null
done
i=0; while up && [ $i -lt 10 ]; do i=$((i + 1)); sleep 0.5; done

# Start the server and wait up to 30 seconds for it to be ready.
mkdir -p .cache
nohup "$PY" server.py > .cache/server.log 2>&1 &   # log kept in .cache/server.log; keeps running after SSH closes
i=0; while ! up && [ $i -lt 30 ]; do i=$((i + 1)); sleep 1; done

BROWSER=$(command -v chromium-browser || command -v chromium)
if [ -z "$BROWSER" ]; then
  echo "Chromium not found. Install it with: sudo apt install chromium"
  exit 1
fi

# Started over SSH? Then there's no screen in this session: open on the Pi's own screen.
if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
  FROM_SSH=1
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  for sock in "$XDG_RUNTIME_DIR"/wayland-*; do
    case "$sock" in *.lock) continue ;; esac
    [ -S "$sock" ] && export WAYLAND_DISPLAY="$(basename "$sock")" && break
  done
  [ -S /tmp/.X11-unix/X0 ] && export DISPLAY=:0
  if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
    echo "Can't find the Pi's screen. Make sure the Pi has booted to the desktop"
    echo "(sudo raspi-config → System Options → Boot / Auto Login → Desktop Autologin)."
    exit 1
  fi
fi
[ -n "$WAYLAND_DISPLAY" ] && OZONE="--ozone-platform=wayland" || OZONE=""

# A fresh browser cache on every start (your Spotify login is kept; it isn't in the cache).
rm -rf "$DIR/.cache/chromium"
set -- "$BROWSER" $OZONE --touch-events=enabled --kiosk --noerrdialogs --disable-infobars --hide-crash-restore-bubble \
  --password-store=basic --check-for-update-interval=31536000 \
  --disk-cache-dir="$DIR/.cache/chromium" "http://127.0.0.1:9090/?kiosk"

if [ -n "$FROM_SSH" ]; then
  # Keep running after you close SSH.
  nohup setsid "$@" > .cache/chromium.log 2>&1 &
  echo "DeskBuddy is open on the Pi's screen. You can close SSH now."
else
  exec "$@"
fi
