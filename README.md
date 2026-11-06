# DeskBuddy

A desktop home dashboard: clock, Spotify now-playing with synced lyrics, uTorrent
downloads, and a Smart Home page with live server, download and Tailscale status.

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

```bash
git clone -b claude/desktop-home-dashboard-3txbxr https://github.com/yakgabee/DeskBuddy.git ~/DeskBuddy
cd ~/DeskBuddy
./kiosk.sh
```

`kiosk.sh` starts DeskBuddy and opens it full-screen in Chromium. Press `Alt+F4` to exit.

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
- **Servers:** the list shown on the Smart Home page. Jellyfin servers also show
  their name and version.

## Show uTorrent downloads

While something is downloading, a **Downloading** card appears on the home screen
with progress, speed and time left. It disappears when nothing is downloading.
The Smart Home page lists every torrent.

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
