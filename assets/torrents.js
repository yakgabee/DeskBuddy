// uTorrent downloads, read through server.py (/api/torrents).
window.DeskTorrents = {
  async status() {
    try {
      const r = await fetch('/api/torrents', { cache: 'no-store' });
      if (r.status === 404) return { connected: false, error: 'no_server' };
      return await r.json();
    } catch (e) {
      return { connected: false, error: 'no_server' };
    }
  },
  active(d) {
    return d.connected ? d.torrents.filter(t => t.state === 'downloading' || t.state === 'stalled') : [];
  },
  bytes(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1000)));
    return `${(n / 1000 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
  },
  speed(n) { return `${this.bytes(n)}/s`; },
  eta(sec) {
    if (!sec) return '';
    if (sec < 60) return 'under a minute left';
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} min left`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h ${m % 60} min left`;
    return `${Math.round(h / 24)} days left`;
  },
  ERRORS: {
    no_server: 'Start DeskBuddy with <code>start.sh</code> or <code>start.bat</code> to see your downloads.',
    not_set_up: 'Not connected yet. Turn on uTorrent\'s Web UI and add it to <code>local-settings.json</code> (see the README).',
    auth: 'uTorrent rejected the username or password in <code>local-settings.json</code>.',
    unreachable: 'Can\'t reach uTorrent. Is it open, with the Web UI turned on?',
    refused: 'uTorrent refused the request. In uTorrent\'s Web UI settings, make sure this computer\'s IP is allowed under “Restrict access to the following IPs” (see the README).',
  },
};
