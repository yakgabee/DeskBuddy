# DeskBuddy

A desktop home dashboard.

**Status: draft** — runs on demo data so the look and flow can be reviewed.

## Features (draft)
- **Clock** — live time, date and greeting.
- **Now Playing** — Spotify-style player card. Click the cover art to open full-screen, time-synced lyrics.
- **Smart Home widget** — shows a quick summary; click to open the Smart Home page.
- **Smart Home page** — devices grouped by room, with toggles, brightness, thermostat, blinds, locks, camera, and one-tap scenes.

## Run it
No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Next steps (after draft approval)
- Connect real Spotify playback (Spotify Web API, OAuth PKCE login).
- Pull real synced lyrics (e.g. LRCLIB) — Spotify's public API doesn't provide lyrics.
- Connect real smart-home devices (e.g. Home Assistant, SmartThings, Google Home).
