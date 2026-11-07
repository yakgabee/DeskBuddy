// Apple TV status and remote control, through server.py (which uses pyatv).
window.DeskAppleTV = {
  device() { return (window.DESKBUDDY_CONFIG.devices || []).find(d => d.appletv && d.host) || null; },
  async status(host) {
    try {
      const r = await fetch(`/api/appletv?${new URLSearchParams({ host })}`, { cache: 'no-store' });
      if (r.status === 404) return { state: 'no_server' };
      return await r.json();
    } catch (e) { return { state: 'no_server' }; }
  },
  async send(host, action) {
    try {
      const r = await fetch('/api/appletv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, action }),
      });
      return r.ok;
    } catch (e) { return false; }
  },
  artworkUrl(host, id) { return `/api/appletv/artwork?${new URLSearchParams({ host, id })}`; },
  // Something is on screen (playing or paused) while the Apple TV is awake.
  isActive(s) {
    return s.state === 'ok' && s.power !== 'off' && ['playing', 'paused', 'loading'].includes(s.deviceState) && !!(s.title || s.app);
  },
  subtitle(s) {
    if (s.series) return s.season && s.episode ? `${s.series} · S${s.season} E${s.episode}` : s.series;
    return [s.artist, s.album].filter(Boolean).join(' · ');
  },
  // Shape used by the home screen's player card.
  toTrack(s, host) {
    return {
      source: 'appletv', app: s.app,
      id: 'atv:' + [s.title, s.series, s.episode, s.app, s.artworkId].join('|'),
      title: s.title || s.app || 'Apple TV',
      artist: this.subtitle(s) || (s.title ? s.app || '' : ''),
      album: '',
      image: s.artworkId ? this.artworkUrl(host, s.artworkId) : null,
      duration: s.total || 0, position: s.position || 0,
      playing: s.deviceState === 'playing', noLyrics: true,
    };
  },
};
