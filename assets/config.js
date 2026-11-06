// DeskBuddy settings — edit this file to change what the dashboard connects to.
window.DESKBUDDY_CONFIG = {
  spotify: {
    // Public Client ID from https://developer.spotify.com/dashboard.
    // The Client Secret is NOT needed (and must never be put here): DeskBuddy
    // logs in with Spotify's PKCE flow, which is made for browser apps.
    clientId: 'd10787298525422984237d396b6c0af4',
    // Must match a Redirect URI in your Spotify app settings exactly.
    redirectUri: 'http://127.0.0.1:9090/',
  },

  // Your Evolux (Smart Life) light. The connection itself is set up once with
  // tinytuya — see "Connect your Evolux light" in the README.
  light: {
    name: 'Smart Light',
  },

  // Servers shown on Smart Home → Servers.
  // type 'jellyfin' reads the server name and version from Jellyfin.
  // type 'web' just checks that the address answers.
  servers: [
    {
      id: 'jellyfin',
      name: 'Jellyfin',
      desc: 'Media server',
      icon: 'film',
      type: 'jellyfin',
      url: 'https://www.gabe-server.com',
    },
    // Add more like this:
    // { id: 'homeassistant', name: 'Home Assistant', desc: 'Home automation', icon: 'home',
    //   type: 'web', url: 'http://192.168.1.10:8123' },
  ],

  // Tailscale devices are read from the Tailscale app on this computer
  // (via server.py) — nothing to set up here.
};
