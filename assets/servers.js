// Live server status checks, run from the browser.
// - 'jellyfin' servers: reads /System/Info/Public (server name + version).
// - anything else, or if that's blocked: checks that the address answers at all.
(() => {
  const TIMEOUT = 6000;
  const SLOW_MS = 1500;

  const timed = async fn => {
    const t0 = performance.now();
    await fn();
    return Math.round(performance.now() - t0);
  };

  // Resolves if the address answers at all (any HTTP response), rejects if unreachable.
  const reachable = url => timed(() =>
    fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT) }));

  async function checkUrl(server, url) {
    const base = url.replace(/\/+$/, '');
    if (server.type === 'agent') {
      let stats;
      const ms = await timed(async () => {
        const r = await fetch(`${base}/stats`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT) });
        if (!r.ok) throw new Error(r.status);
        stats = await r.json();
      });
      return { ms, stats };
    }
    if (server.type === 'jellyfin') {
      try {
        let info;
        const ms = await timed(async () => {
          const r = await fetch(`${base}/System/Info/Public`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT) });
          if (!r.ok) throw new Error(r.status);
          info = await r.json();
        });
        return { ms, version: info.Version, serverName: info.ServerName };
      } catch (e) { /* fall through to a plain reachability check */ }
    }
    return { ms: await reachable(base) };
  }

  async function check(server) {
    const routes = [['Public', server.url]];
    if (server.tailscaleUrl) routes.push(['Tailscale', server.tailscaleUrl]);
    for (const [via, url] of routes) {
      try {
        const r = await checkUrl(server, url);
        return { ...r, via, url, status: r.ms > SLOW_MS ? 'warn' : 'up' };
      } catch (e) { /* try next route */ }
    }
    return { status: 'down', url: server.url };
  }

  window.DeskServers = {
    list() { return window.DESKBUDDY_CONFIG.servers || []; },
    async checkAll() {
      const list = this.list();
      const results = await Promise.all(list.map(check));
      return list.map((s, i) => ({ ...s, ...results[i] }));
    },
    summary(list) {
      const up = list.filter(s => s.status === 'up' || s.status === 'warn').length;
      return { up, total: list.length };
    },
  };
})();
