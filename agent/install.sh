#!/usr/bin/env bash
# Install the DeskBuddy agent on a Linux server as a service that starts on boot.
# It reports RAM and storage to the dashboard on port 9091 (read-only).
#
#     curl -fsSL https://raw.githubusercontent.com/yakgabee/DeskBuddy/claude/desktop-home-dashboard-3txbxr/agent/install.sh | sudo bash
set -eu
URL=https://raw.githubusercontent.com/yakgabee/DeskBuddy/claude/desktop-home-dashboard-3txbxr/agent/deskbuddy-agent.py
[ "$(id -u)" = 0 ] || { echo "Please run with sudo."; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 is needed: sudo apt install python3"; exit 1; }

HERE=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")
if [ -n "$HERE" ] && [ -f "$HERE/deskbuddy-agent.py" ]; then
  cp "$HERE/deskbuddy-agent.py" /opt/deskbuddy-agent.py
else
  curl -fsSL "$URL" -o /opt/deskbuddy-agent.py
fi
chmod 644 /opt/deskbuddy-agent.py

cat > /etc/systemd/system/deskbuddy-agent.service <<'UNIT'
[Unit]
Description=DeskBuddy agent (RAM and storage for the dashboard)
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/deskbuddy-agent.py
Restart=always
DynamicUser=yes

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now deskbuddy-agent >/dev/null 2>&1
systemctl restart deskbuddy-agent

# Let the home network reach it if the ufw firewall is on.
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  NET=$(hostname -I | awk '{print $1}' | awk -F. '{print $1"."$2"."$3".0/24"}')
  ufw allow from "$NET" to any port 9091 proto tcp >/dev/null && echo "Firewall: allowed $NET on port 9091."
fi

sleep 1
if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9091/stats', timeout=3)" 2>/dev/null; then
  echo "✓ DeskBuddy agent is running on port 9091."
else
  echo "! The agent didn't start. Check: systemctl status deskbuddy-agent"; exit 1
fi
