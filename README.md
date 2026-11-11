# DeskBuddy

A desk / wall display for a Raspberry Pi with a 7-inch screen.

**Home screen:** your Wallpaper Engine wallpaper fills the screen, with the date,
a big clock, the weather, what's playing and your next event. A download badge
appears top-right while something downloads.

**Tabs** (tap "Tabs" or swipe up): Spotify (with synced lyrics, or the Apple TV
when Spotify isn't playing), Devices (computer, Apple TV with remote), Servers
(Jellyfin, RAM/storage of your server), Downloads (uTorrent), Tailscale and
Calendar (iCloud). Tap "Clock" or swipe down to go back; it also returns to the
clock by itself after 2 minutes.

## Run it

Spotify sends you back to `http://127.0.0.1:9090/` after logging in, so DeskBuddy
must be opened at exactly that address.

- **Mac / Linux:** `./start.sh`
- **Windows:** double-click `start.bat`

Both run `server.py` (Python 3 needed, nothing to install) and open the browser.
`server.py` serves the dashboard, reads your Tailscale devices from the Tailscale
app on this computer (`tailscale status --json`), and reads your uTorrent
downloads. It only listens on 127.0.0.1.

Want to see it without logging in? Open `http://127.0.0.1:9090/?demo`.

## Running on a 7-inch display

The layout is tuned for 7-inch landscape screens (800×480 and 1024×600): the home
screen fits without scrolling and buttons are sized for touch. Larger monitors
and phones work too.

### Raspberry Pi

**Quickest:** run the setup script. It updates DeskBuddy, asks for your weather key
and uTorrent login (saved only on the Pi), installs and pairs the Apple TV support,
sets up Tailscale, starts DeskBuddy on boot and keeps the screen on. It asks before
each step and is safe to run again.

```bash
cd ~/DeskBuddy && ./setup-pi.sh
```

Or step by step:

```bash
git clone -b claude/desktop-home-dashboard-3txbxr https://github.com/yakgabee/DeskBuddy.git ~/DeskBuddy
cd ~/DeskBuddy
./kiosk.sh
```

`kiosk.sh` starts DeskBuddy and opens it full-screen in Chromium, with the mouse
pointer hidden. Running it again restarts everything, so after a `git pull` just
run `./kiosk.sh` (or reboot) to see the update. Press `Alt+F4` to exit. (To show the pointer again on that screen,
open `http://127.0.0.1:9090/?kiosk=0`.)

**Start it automatically when the Pi boots** (Raspberry Pi OS Bookworm):

```bash
mkdir -p ~/.config/labwc && echo "$HOME/DeskBuddy/kiosk.sh &" >> ~/.config/labwc/autostart
```

**Keep the screen on:** run `sudo raspi-config`, choose **Display Options → Screen
Blanking → No**, then reboot.

### Windows / other computers

Run `start.bat` (or `./start.sh`), then for full-screen: `start chrome --kiosk http://127.0.0.1:9090/`.

## Settings

Everything lives in [`assets/config.js`](assets/config.js):

- **Spotify:** your app's Client ID and Redirect URI. DeskBuddy uses Spotify's
  PKCE login, which is made for browser apps — the **Client Secret is not used and
  must never be put in this project**.
- **Servers:** the list shown on the Servers tab. Jellyfin servers also show
  their name and version.

## Wallpaper (from Wallpaper Engine)

The background is whatever wallpaper Wallpaper Engine is showing on your PC. A
small helper on the PC shares it with the Pi; the Pi checks every minute and
updates when you change it.

- **Video wallpapers** play as video. Big ones (4K, HEVC) are re-encoded on the Pi
  to 1280 px H.264 so they play smoothly (needs `ffmpeg`; `setup-pi.sh` installs it).
  The preview image shows while that happens.
- **Scene and web wallpapers** can't run on a Pi, so their preview image is used
  (often an animated GIF).
- If the PC is off, the last wallpaper stays.

**On the PC** (needs [Python 3](https://www.python.org/downloads/), tick
"Add python.exe to PATH"): double-click `agent\install-windows.bat`. It installs the
helper, starts it now and at every login, allows it through Windows Firewall for
your home network only, and shows the address to use on the Pi.

**On the Pi:** run `./setup-pi.sh` and enter that address (e.g.
`http://10.0.10.132:9091`). It's saved as `"wallpaper": {"agent": "…"}` in
`local-settings.json`; add `"mode": "still"` there to always use a still image
(less work for the Pi).

## Calendar (iCloud)

The Calendar tab shows the next two weeks, and the home screen shows what's next.

1. Make an **app-specific password**: [appleid.apple.com](https://appleid.apple.com)
   → Sign-In and Security → App-Specific Passwords → **+** (name it "DeskBuddy").
   Your normal Apple ID password won't work.
2. Run `./setup-pi.sh` and enter your Apple ID email and that password. You can
   limit it to some calendars (e.g. `Home, Work`).

It's saved in `local-settings.json` on the Pi only. Calendar links (`webcal://…`)
work too: add them as `"urls": [...]` inside `"calendar"`.

## Weather

The clock card shows the current weather and today's high/low from
[OpenWeatherMap](https://openweathermap.org). Add your API key to
`local-settings.json` (it stays on your computer; `server.py` makes the calls):

```json
{
  "weather": { "apiKey": "your-openweathermap-api-key" }
}
```

Your location is worked out from your internet connection. To pick it yourself,
add `"city": "Austin,US"` (or `"lat"` and `"lon"`). Units are °F in the US and °C
elsewhere; force one with `"units": "imperial"` or `"units": "metric"`.

New OpenWeatherMap keys can take up to a couple of hours to start working; until
then the dashboard says "Weather key not active yet".

## Devices (computer, Apple TV)

The **Devices** tab shows whether each device is online. Edit the `devices`
list in `assets/config.js`: give each one its IP address on your home network.
Optionally add a `port` the device always has open for a more reliable check
(Apple TV: `7000`). Find an Apple TV's IP in **Settings → Network**.

## Apple TV

With [pyatv](https://pyatv.dev), the Apple TV card on the **Devices** tab
shows whether it's awake or asleep, what's playing (with artwork and progress),
and has play/pause, skip and Sleep / Turn on buttons. When Spotify isn't playing,
the home screen's player shows what's on the Apple TV instead.

Set the Apple TV's IP in `assets/config.js` (`appletv: true` on its entry), then on
the computer running DeskBuddy (e.g. the Pi):

1. **Install pyatv** in DeskBuddy's own Python environment (takes a few minutes on a Pi):

   ```bash
   cd ~/DeskBuddy && python3 -m venv .venv && .venv/bin/pip install pyatv "srptools<2"
   ```

2. **Pair once.** The Apple TV shows a code on screen (twice: one for remote
   control, one for AirPlay). Type each code when asked:

   ```bash
   .venv/bin/python appletv.py pair 10.0.10.118
   ```

3. **Restart DeskBuddy** (`sudo reboot` on the Pi). `start.sh`, `start.bat` and
   `kiosk.sh` use `.venv` automatically when it exists.

(`srptools<2`: version 2 of that library breaks pyatv's pairing for now.)

The pairing is saved in `~/.pyatv.conf`. If pairing fails, check the Apple TV's
**Settings → AirPlay and HomeKit → Allow Access** is set to *Anyone on the Same
Network* (or *Everyone*). Some apps don't share what's playing; then the card shows
the app name or just "Playing".

## Show a server's RAM and storage

`agent/deskbuddy-agent.py` is a tiny read-only helper that reports a computer's RAM
and storage. It needs only Python 3 and works on Linux and Windows. Run it on each
server you want to watch, then add the server to `assets/config.js` with
`type: 'agent'` (the Local Server at `10.0.10.141` is already there).

**On a Linux server**, one command installs it as a service that starts on boot
(and opens port 9091 in `ufw` for your home network if that firewall is on):

```bash
curl -fsSL https://raw.githubusercontent.com/yakgabee/DeskBuddy/claude/desktop-home-dashboard-3txbxr/agent/install.sh | sudo bash
```

Or by hand:

```bash
sudo curl -o /opt/deskbuddy-agent.py https://raw.githubusercontent.com/yakgabee/DeskBuddy/claude/desktop-home-dashboard-3txbxr/agent/deskbuddy-agent.py
```

```bash
sudo tee /etc/systemd/system/deskbuddy-agent.service >/dev/null <<'UNIT'
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
sudo systemctl enable --now deskbuddy-agent
```

Check it from the Pi with `curl http://10.0.10.141:9091/stats`. If that times out
and the server uses a firewall (`ufw`), allow your network:
`sudo ufw allow from 10.0.10.0/24 to any port 9091`.

**On a Windows server:** run `python deskbuddy-agent.py` (to start it at login, add
it to Task Scheduler) and allow Python through Windows Firewall when asked.

The agent only reports numbers (hostname, RAM, disk usage); it can't change anything.

## Show uTorrent downloads

While something is downloading, a download badge appears at the top right of the
home screen with the progress. Tap it for the Downloads tab.
The Downloads tab lists every torrent.

This uses uTorrent's built-in Web UI (uTorrent Classic, the desktop app):

1. In uTorrent, open **Options → Preferences → Advanced → Web UI**.
2. Tick **Enable Web UI** and choose a username and password.
3. Tick **Alternative listening port** and set it to `8080`. Click **OK**.
4. In the DeskBuddy folder, copy `local-settings.example.json` to
   `local-settings.json` and fill in the same username and password:

   ```json
   {
     "utorrent": {
       "url": "http://127.0.0.1:8080",
       "username": "admin",
       "password": "your-web-ui-password"
     }
   }
   ```

5. Restart DeskBuddy.

`local-settings.json` is git-ignored and never served to the browser. If uTorrent
runs on another computer, use that computer's address instead of `127.0.0.1`
(its Tailscale IP works too).

**If uTorrent answers "invalid request":**
- If **Restrict access to the following IPs** is ticked in the Web UI settings, add
  the IP of the computer running DeskBuddy (on a Pi: `hostname -I`). Separate
  entries with commas, e.g. `127.0.0.1,10.0.10.50`.
- Otherwise, DeskBuddy also works with uTorrent's token check turned off:
  **Preferences → Advanced**, set `webui.token_auth` to `false`.

## Spotify notes

- In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), the app's
  Redirect URI must be exactly `http://127.0.0.1:9090/`.
- While the app is in Development mode, only accounts added under **User Management**
  (plus the owner) can log in.
- Play / pause / skip need Spotify Premium. Showing what's playing works on any account.
- Lyrics come from [LRCLIB](https://lrclib.net) (free, no key); not every song has them.

## Status

- Clock, Spotify, lyrics, server checks, uTorrent downloads, Tailscale devices: **live**.
