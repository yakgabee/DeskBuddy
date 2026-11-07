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
"$PY" server.py > .cache/server.log 2>&1 &   # log kept in .cache/server.log
i=0; while ! up && [ $i -lt 30 ]; do i=$((i + 1)); sleep 1; done

BROWSER=$(command -v chromium-browser || command -v chromium)
if [ -z "$BROWSER" ]; then
  echo "Chromium not found. Install it with: sudo apt install chromium"
  exit 1
fi

# A fresh browser cache on every start (your Spotify login is kept; it isn't in the cache).
rm -rf "$DIR/.cache/chromium"
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --hide-crash-restore-bubble \
  --password-store=basic --check-for-update-interval=31536000 \
  --disk-cache-dir="$DIR/.cache/chromium" "http://127.0.0.1:9090/?kiosk"
