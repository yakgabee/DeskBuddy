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

  // Servers shown on Smart Home.
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
    {
      id: 'local-server',
      name: 'Local Server',
      desc: 'Home server',
      icon: 'server',
      type: 'agent',
      url: 'http://10.0.10.141:9091',
    },
    // Add more like this:
    // { id: 'homeassistant', name: 'Home Assistant', desc: 'Home automation', icon: 'home',
    //   type: 'web', url: 'http://192.168.1.10:8123' },
  ],

  // Devices on Smart Home → Devices, shown as online/offline.
  // host: the device's IP address on your home network.
  // port (optional): a port the device always has open, for a more reliable check
  //   (Apple TV: 7000 for AirPlay; Windows PC with uTorrent's Web UI: 8080).
  devices: [
    { id: 'computer', name: 'Computer', icon: 'laptop', host: '10.0.10.132', port: 8080 },
    { id: 'apple-tv', name: 'Apple TV', icon: 'tv', host: '', port: 7000 }, // ← put your Apple TV's IP here
  ],

  // Tailscale devices are read from the Tailscale app on this computer
  // (via server.py) — nothing to set up here.
};
