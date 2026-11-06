// Tailscale devices, read from the Tailscale app on this computer via server.py.
window.DeskTailscale = {
  async status() {
    try {
      const r = await fetch('/api/tailscale', { cache: 'no-store' });
      if (r.status === 404) return { error: 'no_server' };
      const d = await r.json();
      return d;
    } catch (e) {
      return { error: 'no_server' };
    }
  },
  summary(d) {
    if (!d || d.error) return null;
    const all = [d.self, ...d.peers];
    return { online: all.filter(n => n.online).length, total: all.length };
  },
};
