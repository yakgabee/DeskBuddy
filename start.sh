#!/usr/bin/env sh
# Start DeskBuddy at http://127.0.0.1:9090/ (the address Spotify redirects back to).
cd "$(dirname "$0")"
( sleep 1; (xdg-open http://127.0.0.1:9090/ || open http://127.0.0.1:9090/) >/dev/null 2>&1 ) &
python3 server.py
