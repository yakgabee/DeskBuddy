// Synced lyrics from LRCLIB (https://lrclib.net) — free, no key needed.
(() => {
  const cache = new Map();

  // "[01:23.45] line" → [[83.45, 'line'], ...]
  function parseLrc(lrc) {
    const out = [];
    lrc.split('\n').forEach(raw => {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!stamps.length) return;
      const text = raw.replace(/\[[^\]]*\]/g, '').trim() || '♪';
      stamps.forEach(m => out.push([Number(m[1]) * 60 + Number(m[2]), text]));
    });
    return out.sort((a, b) => a[0] - b[0]);
  }

  function toResult(d) {
    if (d?.syncedLyrics) return { synced: true, lines: parseLrc(d.syncedLyrics) };
    if (d?.plainLyrics) return { synced: false, lines: d.plainLyrics.split('\n').map(l => [null, l.trim() || ' ']) };
    if (d?.instrumental) return { synced: false, lines: [[null, 'Instrumental']] };
    return null;
  }

  async function fetchLyrics(track) {
    const base = 'https://lrclib.net/api';
    const q = new URLSearchParams({ track_name: track.title, artist_name: track.artist.split(',')[0] });
    try {
      const exact = new URLSearchParams(q);
      if (track.album) exact.set('album_name', track.album);
      if (track.duration) exact.set('duration', Math.round(track.duration));
      const r = await fetch(`${base}/get?${exact}`);
      if (r.ok) { const res = toResult(await r.json()); if (res) return res; }
    } catch (e) {}
    try {
      const r = await fetch(`${base}/search?${q}`);
      if (r.ok) {
        const list = await r.json();
        const best = list.find(x => x.syncedLyrics) || list.find(x => x.plainLyrics);
        const res = toResult(best);
        if (res) return res;
      }
    } catch (e) {}
    return null;
  }

  window.Lyrics = {
    parseLrc,
    get(track) {
      const key = track.id || `${track.title}|${track.artist}`;
      if (!cache.has(key)) cache.set(key, fetchLyrics(track));
      return cache.get(key);
    },
  };
})();
