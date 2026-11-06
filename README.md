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
- **Light:** the name shown for your light. The connection is set up as described below.
- **Servers:** the list shown on Smart Home → Servers. Jellyfin servers also show
  their name and version.

## Connect your Evolux light

Your Evolux bulb shows up as Smart Life in Alexa, which means it's a Tuya device. DeskBuddy controls it directly
over your home Wi-Fi using [tinytuya](https://github.com/jasonacox/tinytuya). Alexa
keeps working as before. You only do this once (about 10 minutes).

**1. Put the light in the Smart Life app**
1. Install **Smart Life** on your phone and create an account (or sign in).
2. If your light already shows up, skip to step 2. If not, tap **+** to add it. To put
   the bulb in pairing mode, switch it off and on 3 times until it blinks quickly.
3. Adding the light to Smart Life can remove it from Alexa. To get it back, open the
   Alexa app, go to **Skills**, find **Smart Life**, tap **Enable**, sign in with the same
   Smart Life account, and let Alexa discover devices.

**2. Install the light helper.** On the computer that runs DeskBuddy:

```bash
pip install tinytuya
```

**3. Create a free Tuya developer project.** This is needed once, to get your light's key.
1. Sign up at [platform.tuya.com](https://platform.tuya.com).
2. Go to **Cloud → Development → Create Cloud Project**. Choose *Smart Home* for both
   industry and development method, and pick the data centre for where you live
   (for example *Western America*).
3. Open the project, go to **Devices → Link App Account → Add App Account**, and
   scan the QR code with the Smart Life app (**Me** tab → scan icon at the top).
4. From the project's **Overview**, copy the **Access ID** and **Access Secret**.

**4. Fetch the key.** In the DeskBuddy folder, run:

```bash
python -m tinytuya wizard
```

Paste the Access ID and Secret, type `scan` when asked for a device ID, and pick
your region. Answer **Y** when it asks to poll local devices. This creates
`devices.json` and `snapshot.json` in the DeskBuddy folder. They hold your light's
key: they're excluded from git, and DeskBuddy never serves them to the browser.

**5. Restart DeskBuddy.** The "Preview only" notice disappears and the controls
change the real light.

If you ever re-pair the bulb, or it gets a new IP address and stops answering,
run `python -m tinytuya wizard` again (or `python -m tinytuya scan` for a new IP).

## Spotify notes

- In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), the app's
  Redirect URI must be exactly `http://127.0.0.1:9090/`.
- While the app is in Development mode, only accounts added under **User Management**
  (plus the owner) can log in.
- Play / pause / skip need Spotify Premium. Showing what's playing works on any account.
- Lyrics come from [LRCLIB](https://lrclib.net) (free, no key); not every song has them.

## Status

- Clock, Spotify, lyrics, server checks, Tailscale devices: **live**.
- Smart light: **live** once set up (see "Connect your Evolux light"); preview until then.
