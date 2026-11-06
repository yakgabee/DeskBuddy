(() => {
  const $ = id => document.getElementById(id);
  const DEMO = new URLSearchParams(location.search).has('demo');

  // ---------- Clock ----------
  DeskClock.start({ time: $('time'), date: $('date'), greeting: $('greeting') });

  // ---------- Smart home summary ----------
  const refreshStatus = async () => {
    const [servers, ts] = await Promise.all([DeskServers.checkAll(), DeskTailscale.status()]);
    const sv = DeskServers.summary(servers);
    $('stat-servers').textContent = `${sv.up}/${sv.total}`;
    const t = DeskTailscale.summary(ts);
    $('stat-ts').textContent = t ? `${t.online}/${t.total}` : '–';
  };
  refreshStatus();
  setInterval(refreshStatus, 60000);

  // ---------- Downloads (uTorrent) ----------
  const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const refreshDownloads = async () => {
    const d = await DeskTorrents.status();
    const active = DeskTorrents.active(d);
    $('downloads').hidden = !active.length;
    document.querySelector('.dashboard').classList.toggle('has-downloads', active.length > 0);
    if (!active.length) return;
    $('dl-title').textContent = active.length === 1 ? 'Downloading' : `Downloading ${active.length} files`;
    $('dl-speed').textContent = `↓ ${DeskTorrents.speed(d.downSpeed)}`;
    const shown = active.slice(0, 2);
    $('dl-list').innerHTML = shown.map(t => `
      <div class="dl-item">
        <div class="dl-row"><span class="dl-name">${escHtml(t.name)}</span><span class="dl-pct">${Math.floor(t.progress)}%</span></div>
        <div class="meter"><div style="width:${t.progress}%"></div></div>
        <div class="dl-meta">${t.state === 'stalled' ? 'Waiting for peers' : [DeskTorrents.speed(t.downSpeed), DeskTorrents.eta(t.eta)].filter(Boolean).join(' · ')}
          · ${DeskTorrents.bytes(t.size - t.remaining)} of ${DeskTorrents.bytes(t.size)}</div>
      </div>`).join('')
      + (active.length > shown.length ? `<div class="dl-more">+${active.length - shown.length} more</div>` : '');
  };
  refreshDownloads();
  setInterval(refreshDownloads, 3000);

  // ---------- Helpers ----------
  const fmt = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let toastTimer;
  const toast = msg => {
    $('toast').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
  };
  const setVar = (k, v) => document.documentElement.style.setProperty(k, v);

  // Average colour of the album art, used to tint the lyrics screen.
  function tintFromImage(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        setVar('--track-bg', `rgb(${r / n | 0}, ${g / n | 0}, ${b / n | 0})`);
      } catch (e) { /* image not readable — keep neutral tint */ }
    };
    img.src = url;
  }

  // ---------- Player state ----------
  // track: { id, title, artist, album, image, bg, fg, duration, position, playing }
  let track = null;
  let renderedId = null;
  let lyrics = null;      // { synced, lines: [[time|null, text]] }
  let activeLine = -1;

  function showState({ source, title, message, connect }) {
    $('now-playing').classList.add('is-empty');
    $('now-playing').classList.remove('has-image');
    $('np-source').textContent = source;
    $('np-title').textContent = title;
    $('np-artist').textContent = '';
    $('np-album').textContent = '';
    $('np-message').hidden = !message;
    $('np-message').innerHTML = message || '';
    $('btn-connect').hidden = !connect;
    renderedId = null;
    closeLyrics();
  }

  function renderTrack() {
    const np = $('now-playing');
    np.classList.remove('is-empty');
    $('np-message').hidden = true;
    $('btn-connect').hidden = true;
    $('np-source').textContent = DEMO ? 'Demo player' : (track.playing ? 'Now playing on Spotify' : 'Paused on Spotify');
    $('np-title').textContent = track.title;
    $('np-artist').textContent = track.artist;
    $('np-album').textContent = track.album || '';
    $('t-dur').textContent = fmt(track.duration);
    $('lyrics-title').textContent = track.title;
    $('lyrics-artist').textContent = track.artist;

    if (track.image) {
      np.classList.add('has-image');
      $('cover-img').src = track.image;
      $('cover-img').hidden = false;
      $('lyrics-cover').innerHTML = `<img src="${esc(track.image)}" alt="">`;
      setVar('--track-bg', '#3f3f46');
      tintFromImage(track.image);
    } else {
      np.classList.remove('has-image');
      $('cover-img').hidden = true;
      setVar('--track-bg', track.bg || '#3f3f46');
      setVar('--track-fg', track.fg || '#fafafa');
      $('cover-album').textContent = track.album || track.title;
      $('cover-artist').textContent = track.artist;
      $('lyrics-cover').textContent = (track.album || track.title).split(' ').map(w => w[0]).join('').slice(0, 2);
    }
    loadLyrics();
    renderedId = track.id;
  }

  async function loadLyrics() {
    const id = track.id;
    lyrics = null;
    activeLine = -1;
    $('lyrics-body').classList.remove('plain');
    $('lyrics-body').innerHTML = '<p class="lyrics-status">Loading lyrics…</p>';
    const result = track.lyrics
      ? { synced: true, lines: track.lyrics }
      : track.isEpisode ? null : await Lyrics.get(track);
    if (!track || track.id !== id) return; // song changed while loading
    lyrics = result;
    if (!result || !result.lines.length) {
      $('lyrics-body').innerHTML = `<p class="lyrics-status">${track.isEpisode ? 'Lyrics aren\'t available for podcasts.' : 'No lyrics found for this song.'}</p>`;
      return;
    }
    $('lyrics-body').classList.toggle('plain', !result.synced);
    $('lyrics-body').innerHTML = result.lines
      .map(([, line], i) => `<p class="lyric-line" data-i="${i}">${esc(line)}</p>`).join('');
    renderProgress();
  }

  function renderProgress() {
    if (!track) return;
    $('progress-fill').style.width = `${Math.min(100, (track.position / track.duration) * 100)}%`;
    $('t-cur').textContent = fmt(track.position);
    $('btn-play').innerHTML = icon(track.playing ? 'pause' : 'play', 22);
    $('now-playing').classList.toggle('paused', !track.playing);

    if (!lyrics || !lyrics.synced) return;
    let idx = 0;
    lyrics.lines.forEach(([ts], i) => { if (track.position >= ts) idx = i; });
    if (idx === activeLine) return;
    activeLine = idx;
    document.querySelectorAll('.lyric-line').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      el.classList.toggle('past', i < idx);
    });
    const el = document.querySelector(`.lyric-line[data-i="${idx}"]`);
    if (el && $('lyrics').classList.contains('open')) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function setTrack(t) {
    track = t;
    if (!track) return;
    if (track.id !== renderedId) renderTrack();
    $('np-source').textContent = DEMO ? 'Demo player' : (track.playing ? 'Now playing on Spotify' : 'Paused on Spotify');
    renderProgress();
  }

  // Move the progress bar smoothly between Spotify polls.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (DEMO) { MockPlayer.tick(dt); setTrack(demoTrack()); return; }
    if (track && track.playing) {
      track.position = Math.min(track.duration, track.position + dt);
      renderProgress();
    }
  }, 250);

  // ---------- Sources ----------
  const demoTrack = () => {
    const t = MockPlayer.current;
    return { ...t, id: 'demo-' + MockPlayer.index, image: null, position: MockPlayer.position, playing: MockPlayer.playing };
  };

  const ORIGIN_HELP = () => {
    const want = DESKBUDDY_CONFIG.spotify.redirectUri;
    return `To connect Spotify, open DeskBuddy at <code>${esc(want)}</code> (run <code>start.sh</code> or <code>start.bat</code>).`;
  };

  let pauseUntil = 0; // set when Spotify asks us to slow down

  async function pollSpotify() {
    if (Date.now() < pauseUntil) return;
    if (!Spotify.isLoggedIn()) {
      track = null;
      $('btn-disconnect').hidden = true;
      return Spotify.onRedirectOrigin()
        ? showState({ source: 'Spotify', title: 'Connect Spotify', connect: true,
            message: 'See what\'s playing, control playback and read along with the lyrics.' })
        : showState({ source: 'Spotify', title: 'Connect Spotify', message: ORIGIN_HELP() });
    }
    $('btn-disconnect').hidden = false;
    try {
      const t = await Spotify.nowPlaying();
      if (!t) {
        track = null;
        return showState({ source: 'Spotify', title: 'Nothing playing',
          message: 'Start something on Spotify and it\'ll show up here.' });
      }
      setTrack(t);
    } catch (e) {
      if (e.code === 'auth') return pollSpotify();
      if (e.code === 'rate') pauseUntil = Date.now() + e.retryAfter * 1000;
      // Keep showing the last song; just note the connection problem.
      $('np-source').textContent = 'Can\'t reach Spotify right now';
    }
  }

  async function control(action) {
    if (DEMO) {
      ({ play: () => MockPlayer.toggle(), pause: () => MockPlayer.toggle(),
         next: () => MockPlayer.next(), previous: () => MockPlayer.prev() })[action]();
      setTrack(demoTrack());
      return;
    }
    if (!track) return;
    if (action === 'play' || action === 'pause') { track.playing = action === 'play'; renderProgress(); }
    try {
      await Spotify[action]();
    } catch (e) {
      toast(e.code === 'premium' ? 'Playback controls need Spotify Premium' : 'Couldn\'t reach Spotify');
    }
    setTimeout(pollSpotify, 500);
  }

  $('btn-play').onclick = () => control(track && track.playing ? 'pause' : 'play');
  $('btn-next').onclick = () => control('next');
  $('btn-prev').onclick = () => control('previous');
  $('btn-connect').onclick = () => Spotify.login();
  $('btn-disconnect').onclick = () => { Spotify.logout(); pollSpotify(); };

  // ---------- Lyrics overlay ----------
  function openLyrics() {
    if (!track) return;
    $('lyrics').classList.add('open');
    activeLine = -1; // force scroll to the current line
    renderProgress();
  }
  function closeLyrics() { $('lyrics').classList.remove('open'); }
  $('cover').onclick = openLyrics;
  $('btn-lyrics').onclick = openLyrics;
  $('lyrics-close').onclick = closeLyrics;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLyrics(); });

  // ---------- Start ----------
  if (DEMO) {
    setTrack(demoTrack());
  } else {
    Spotify.handleRedirect()
      .catch(e => toast(e.message))
      .finally(() => {
        pollSpotify();
        setInterval(pollSpotify, 3000);
      });
  }
})();
