#!/usr/bin/env sh
# Raspberry Pi / Linux: start DeskBuddy and open it full-screen (kiosk mode).
# Exit kiosk mode with Alt+F4.
cd "$(dirname "$0")"

# Start the DeskBuddy server (skipped if it's already running).
python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9090/', timeout=1)" 2>/dev/null \
  || python3 server.py &

# Wait up to 30 seconds for it to be ready.
i=0
while [ $i -lt 30 ]; do
  python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9090/', timeout=1)" 2>/dev/null && break
  i=$((i + 1)); sleep 1
done

BROWSER=$(command -v chromium-browser || command -v chromium)
if [ -z "$BROWSER" ]; then
  echo "Chromium not found. Install it with: sudo apt install chromium-browser"
  exit 1
fi

exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --hide-crash-restore-bubble \
  --password-store=basic --check-for-update-interval=31536000 http://127.0.0.1:9090/
