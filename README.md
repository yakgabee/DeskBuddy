# DeskBuddy

A desktop home dashboard: clock, Spotify now-playing with synced lyrics, and a
Smart Home page with device controls and a live server status board.

## Run it

Spotify sends you back to `http://127.0.0.1:9090/` after logging in, so DeskBuddy
must be opened at exactly that address.

- **Mac / Linux:** `./start.sh`
- **Windows:** double-click `start.bat`

Both just run `python3 -m http.server 9090 --bind 127.0.0.1` and open the browser.
(Python 3 needs to be installed.)

Want to see it without logging in? Open `http://127.0.0.1:9090/?demo`.

## Settings

Everything lives in [`assets/config.js`](assets/config.js):

- **Spotify:** your app's Client ID and Redirect URI. DeskBuddy uses Spotify's
  PKCE login, which is made for browser apps — the **Client Secret is not used and
  must never be put in this project**.
- **Servers:** the list shown on Smart Home → Servers. Jellyfin servers also show
  their name and version. An optional `tailscaleUrl` is tried when the main address
  doesn't answer.

## Spotify notes

- In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), the app's
  Redirect URI must be exactly `http://127.0.0.1:9090/`.
- While the app is in Development mode, only accounts added under **User Management**
  (plus the owner) can log in.
- Play / pause / skip need Spotify Premium. Showing what's playing works on any account.
- Lyrics come from [LRCLIB](https://lrclib.net) (free, no key); not every song has them.

## Status

- Clock, Spotify, lyrics, server checks: **live**.
- Smart home devices: **demo data** until a smart home system is connected.
