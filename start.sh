#!/usr/bin/env sh
# Serve DeskBuddy at http://127.0.0.1:9090/ (the address Spotify redirects back to).
cd "$(dirname "$0")"
echo "DeskBuddy running at http://127.0.0.1:9090/  (Ctrl+C to stop)"
( sleep 1; (xdg-open http://127.0.0.1:9090/ || open http://127.0.0.1:9090/) >/dev/null 2>&1 ) &
python3 -m http.server 9090 --bind 127.0.0.1
