@echo off
REM Start DeskBuddy at http://127.0.0.1:9090/ (the address Spotify redirects back to).
cd /d "%~dp0"
start "" http://127.0.0.1:9090/
python server.py
