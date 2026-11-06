# DeskBuddy

A desktop home dashboard: clock, Spotify now-playing with synced lyrics, and a
Smart Home page with device controls and a live server status board.

## Run it

Spotify sends you back to `http://127.0.0.1:9090/` after logging in, so DeskBuddy
must be opened at exactly that address.

- **Mac / Linux:** `./start.sh`
- **Windows:** double-click `start.bat`

Both run `server.py` (Python 3 needed, nothing to install) and open the browser.
`server.py` serves the dashboard and reads your Tailscale devices from the
Tailscale app on this computer (`tailscale status --json`). It only listens on
127.0.0.1.

Want to see it without logging in? Open `http://127.0.0.1:9090/?demo`.

## Settings

Everything lives in [`assets/config.js`](assets/config.js):

- **Spotify:** your app's Client ID and Redirect URI. DeskBuddy uses Spotify's
  PKCE login, which is made for browser apps — the **Client Secret is not used and
  must never be put in this project**.
- **Light:** the name of your smart light.
- **Servers:** the list shown on Smart Home → Servers. Jellyfin servers also show
  their name and version.

## Spotify notes

- In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), the app's
  Redirect URI must be exactly `http://127.0.0.1:9090/`.
- While the app is in Development mode, only accounts added under **User Management**
  (plus the owner) can log in.
- Play / pause / skip need Spotify Premium. Showing what's playing works on any account.
- Lyrics come from [LRCLIB](https://lrclib.net) (free, no key); not every song has them.

## Status

- Clock, Spotify, lyrics, server checks, Tailscale devices: **live**.
- Smart light: **preview only** until the light's brand is connected.
