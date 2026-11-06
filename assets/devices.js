// Home-network devices (computer, Apple TV, …): online/offline via server.py.
window.DeskDevices = {
  list() { return window.DESKBUDDY_CONFIG.devices || []; },
  async check(d) {
    if (!d.host) return { ...d, status: 'unset' };
    try {
      const q = new URLSearchParams({ host: d.host });
      if (d.port) q.set('ports', d.port);
      const r = await fetch(`/api/ping?${q}`, { cache: 'no-store' });
      if (r.status === 404) return { ...d, status: 'no_server' };
      const j = await r.json();
      if (j.error) return { ...d, status: 'invalid' };
      return { ...d, status: j.online ? 'online' : 'offline', ms: j.ms };
    } catch (e) {
      return { ...d, status: 'no_server' };
    }
  },
  checkAll() { return Promise.all(this.list().map(d => this.check(d))); },
  summary(list) {
    const set = list.filter(d => d.status === 'online' || d.status === 'offline');
    return { online: set.filter(d => d.status === 'online').length, total: set.length };
  },
};
