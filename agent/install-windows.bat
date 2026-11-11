@echo off
REM DeskBuddy helper for Windows: shares your Wallpaper Engine wallpaper (and this
REM PC's RAM/storage) with the dashboard on your Pi. Starts each time you log in.
REM Double-click this file. Needs Python 3 from python.org.
setlocal
set "DEST=%LOCALAPPDATA%\DeskBuddy"
set "PYW="
where pyw >nul 2>nul && set "PYW=pyw"
if not defined PYW where pythonw >nul 2>nul && set "PYW=pythonw"
if not defined PYW (
  echo Python 3 is needed. Install it from https://www.python.org/downloads/
  echo ^(tick "Add python.exe to PATH"^), then run this again.
  pause
  exit /b 1
)
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0deskbuddy-agent.py" "%DEST%\deskbuddy-agent.py" >nul || (echo Could not copy deskbuddy-agent.py & pause & exit /b 1)

REM Start automatically when you log in
> "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DeskBuddy helper.bat" echo @start "" %PYW% "%DEST%\deskbuddy-agent.py"

REM Let the Pi reach it, from your home network only (Windows asks for permission)
powershell -NoProfile -Command "Start-Process netsh -Verb RunAs -WindowStyle Hidden -ArgumentList 'advfirewall firewall add rule name=DeskBuddy-helper dir=in action=allow protocol=TCP localport=9091 profile=any remoteip=localsubnet'"

REM Start it now
start "" %PYW% "%DEST%\deskbuddy-agent.py"
echo.
echo Done! The DeskBuddy helper is running and starts each time you log in.
echo On the Pi, run ./setup-pi.sh and use this as the wallpaper address:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo     http://%%b:9091
echo.
pause
