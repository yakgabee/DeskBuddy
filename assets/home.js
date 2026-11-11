(() => {
  const $ = id => document.getElementById(id);
  const DEMO = new URLSearchParams(location.search).has('demo');

  // (The clock and date are drawn by shell.js.)

  // ---------- Smart home summary ----------
  // The Devices / Servers / Tailscale counts live on the tabs (smart-home.js).
  let lastAtv = null; // latest Apple TV status (set by pollAppleTV below)
  const refreshStatus = () => {};

  // ---------- Weather ----------
  // When weather can't load, say why instead of hiding it.
  const WEATHER_PROBLEMS = {
    not_set_up: ['Weather not set up', 'Add your key with setup-pi.sh'],
    bad_key: ['Weather key not active yet', 'New keys can take up to 2 hours'],
    no_location: ['Can\'t find your location', 'Set your city with setup-pi.sh'],
    not_found: ['City not found', 'Check the city in setup-pi.sh'],
    unreachable: ['Weather unavailable', 'Trying again soon'],
  };
  let hadWeather = false;
  const refreshWeather = async () => {
    const w = await DeskWeather.get();
    if (w.error) {
      if (w.error === 'no_server') return;                   // dashboard started without server.py
      if (w.error === 'unreachable' && hadWeather) return;    // keep the last reading on a blip
      const [cond, hint] = WEATHER_PROBLEMS[w.error] || WEATHER_PROBLEMS.unreachable;
      $('weather').hidden = false;
      $('weather').classList.add('wx-problem');
      $('wx-icon').innerHTML = icon('cloud', 30);
      $('wx-temp').textContent = '–';
      $('wx-cond').textContent = cond;
      $('wx-range').textContent = hint;
      return;
    }
    hadWeather = true;
    const unit = w.units === 'imperial' ? '°F' : '°C';
    $('weather').hidden = false;
    $('weather').classList.remove('wx-problem');
    $('wx-icon').innerHTML = icon(DeskWeather.icon(w.icon), 30);
    $('wx-temp').textContent = `${w.temp}°`;
    $('wx-cond').textContent = w.description ? w.description[0].toUpperCase() + w.description.slice(1) : w.condition;
    $('wx-range').textContent = `H ${w.high}° · L ${w.low}°`;
    $('weather').title = `${w.city} · feels like ${w.feelsLike}${unit}`;
  };
  refreshWeather();
  setInterval(refreshWeather, 5 * 60 * 1000);

  // ---------- Downloads (uTorrent) ----------
  const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Top-right download badge, shown only while something is downloading.
  const refreshDownloads = async () => {
    const d = await DeskTorrents.status();
    const active = DeskTorrents.active(d);
    $('downloads').hidden = !active.length;
    if (!active.length) return;
    const pct = Math.floor(active.reduce((a, t) => a + t.progress, 0) / active.length);
    $('dl-pct').textContent = active.length > 1 ? `${active.length} · ${pct}%` : `${pct}%`;
    $('downloads').title = active.map(t => `${t.name} — ${Math.floor(t.progress)}%`).join('\n') + `\n↓ ${DeskTorrents.speed(d.downSpeed)}`;
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
  // track: { source, id, title, artist, album, image, bg, fg, duration, position, playing, noLyrics }
  // The card shows Spotify while it's playing; otherwise whatever the Apple TV is playing.
  let track = null;
  let spotifyTrack = null;   // latest from Spotify (null = nothing)
  let spotifyEmpty = null;   // what to show when nothing plays anywhere
  let atvTrack = null;       // latest from the Apple TV (null = nothing)
  const atvDevice = window.DeskAppleTV ? DeskAppleTV.device() : null;

  const sourceLabel = t => DEMO ? 'Demo player'
    : t.source === 'appletv' ? `${t.playing ? 'Now playing' : 'Paused'} on Apple TV${t.app ? ` · ${t.app}` : ''}`
    : t.playing ? 'Now playing on Spotify' : 'Paused on Spotify';

  function decide() {
    const pick = spotifyTrack && spotifyTrack.playing ? spotifyTrack : atvTrack || spotifyTrack;
    if (pick) return setTrack(pick);
    track = null;
    showState(spotifyEmpty || { source: 'Spotify', title: 'Spotify' });
    $('btn-disconnect').hidden = DEMO || !Spotify.isLoggedIn();
    $('btn-search').hidden = DEMO || !Spotify.isLoggedIn();
    announce();
  }
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
    np.classList.toggle('no-lyrics', !!track.noLyrics);
    np.classList.toggle('no-progress', !track.duration);
    $('np-source').textContent = sourceLabel(track);
    $('np-title').textContent = track.title;
    $('np-artist').textContent = track.artist;
    $('np-album').textContent = track.album || '';
    $('t-dur').textContent = track.duration ? fmt(track.duration) : '';
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
    if (track.noLyrics) return;
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
    $('progress-fill').style.width = track.duration ? `${Math.min(100, (track.position / track.duration) * 100)}%` : '0';
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
    $('np-source').textContent = sourceLabel(track);
    $('btn-disconnect').hidden = DEMO || track.source === 'appletv' || !Spotify.isLoggedIn();
    $('btn-search').hidden = DEMO || !Spotify.isLoggedIn();
    renderProgress();
    renderVolume();
    announce();
  }

  // Tell the home screen what's playing (the line under the clock).
  let announced = '';
  function announce() {
    const info = track ? { title: track.title, artist: track.artist, playing: track.playing, source: track.source || 'spotify' } : null;
    const key = JSON.stringify(info);
    if (key === announced) return;
    announced = key;
    window.dispatchEvent(new CustomEvent('deskbuddy:nowplaying', { detail: info }));
  }

  // Move the progress bar smoothly between Spotify polls.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (DEMO) { MockPlayer.tick(dt); setTrack(demoTrack()); return; }
    if (track && track.playing) {
      track.position = track.duration ? Math.min(track.duration, track.position + dt) : track.position + dt;
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
      spotifyTrack = null;
      $('btn-disconnect').hidden = true;
      spotifyEmpty = Spotify.onRedirectOrigin()
        ? { source: 'Spotify', title: 'Connect Spotify', connect: true,
            message: 'See what\'s playing, control playback and read along with the lyrics.' }
        : { source: 'Spotify', title: 'Connect Spotify', message: ORIGIN_HELP() };
      return decide();
    }
    try {
      const t = await Spotify.nowPlaying();
      spotifyTrack = t ? { ...t, source: 'spotify' } : null;
      spotifyEmpty = { source: 'Spotify', title: 'Nothing playing',
        message: 'Tap Search to pick something, or start it on Spotify or the Apple TV and it\'ll show up here.' };
      decide();
    } catch (e) {
      if (e.code === 'auth') return pollSpotify();
      if (e.code === 'rate') pauseUntil = Date.now() + e.retryAfter * 1000;
      // Keep showing the last song; just note the connection problem.
      if (track && track.source === 'spotify') $('np-source').textContent = 'Can\'t reach Spotify right now';
    }
  }

  async function pollAppleTV() {
    if (!atvDevice || DEMO) return;
    const s = await DeskAppleTV.status(atvDevice.host);
    const wasOk = lastAtv && lastAtv.state === 'ok';
    lastAtv = s;
    if ((s.state === 'ok') !== wasOk) refreshStatus(); // update the Devices count right away
    atvTrack = DeskAppleTV.isActive(s) ? DeskAppleTV.toTrack(s, atvDevice.host) : null;
    decide();
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
    if (track.source === 'appletv') {
      const cmd = action === 'play' || action === 'pause' ? 'play_pause' : action;
      if (!(await DeskAppleTV.send(atvDevice.host, cmd))) toast('Couldn\'t reach the Apple TV');
      setTimeout(pollAppleTV, 600);
      return;
    }
    try {
      await Spotify[action]();
    } catch (e) {
      toast(e.code === 'premium' ? 'Playback controls need Spotify Premium' : 'Couldn\'t reach Spotify');
    }
    setTimeout(pollSpotify, 500);
  }

  // ---------- Volume (Spotify only; some devices, like phones, don't allow it) ----------
  let volume = null;          // what the slider shows
  let lastLoud = 50;          // volume to go back to after unmuting
  let volHoldUntil = 0;       // ignore Spotify's (older) volume for a moment after a change
  let volTimer = null, volSent = 0;
  let demoVolume = 60;

  function renderVolume() {
    const show = track && (DEMO || (track.source === 'spotify' && track.supportsVolume));
    $('volume').hidden = !show;
    if (!show) return;
    if (Date.now() > volHoldUntil) volume = DEMO ? demoVolume : track.volume;
    if (volume > 0) lastLoud = volume;
    if (document.activeElement !== $('vol-slider')) $('vol-slider').value = volume;
    $('vol-slider').style.setProperty('--vol', `${volume}%`);
    $('vol-pct').textContent = volume;
    $('vol-btn').innerHTML = icon(volume === 0 ? 'mute' : volume < 50 ? 'volumeLow' : 'volume', 20);
    $('vol-btn').setAttribute('aria-label', volume === 0 ? 'Unmute' : 'Mute');
    $('volume').title = track.device ? `Volume on ${track.device}` : 'Volume';
  }

  // Send at most every 350 ms while dragging, plus the final value.
  function setVolume(v, final) {
    volume = Math.max(0, Math.min(100, Math.round(v)));
    volHoldUntil = Date.now() + 4000;
    renderVolume();
    if (DEMO) { demoVolume = volume; return; }
    clearTimeout(volTimer);
    const wait = final ? 0 : Math.max(0, 350 - (Date.now() - volSent));
    volTimer = setTimeout(async () => {
      volSent = Date.now();
      try {
        await Spotify.setVolume(volume);
      } catch (e) {
        toast(e.code === 'premium' ? 'Volume control needs Spotify Premium (or this device doesn\'t allow it)' : 'Couldn\'t change the volume');
        volHoldUntil = 0;
      }
    }, wait);
  }
  $('vol-slider').addEventListener('input', e => setVolume(Number(e.target.value), false));
  $('vol-slider').addEventListener('change', e => { setVolume(Number(e.target.value), true); e.target.blur(); });
  $('vol-btn').onclick = () => setVolume(volume === 0 ? lastLoud || 50 : 0, true);

  $('btn-play').onclick = () => control(track && track.playing ? 'pause' : 'play');
  $('btn-next').onclick = () => control('next');
  $('btn-prev').onclick = () => control('previous');
  $('btn-connect').onclick = () => Spotify.login();
  $('btn-disconnect').onclick = () => { Spotify.logout(); pollSpotify(); };
  // A song picked in search: show it as soon as Spotify has started it.
  window.addEventListener('deskbuddy:spotify-refresh', () => { setTimeout(pollSpotify, 700); setTimeout(pollSpotify, 2000); });

  // ---------- Lyrics overlay ----------
  function openLyrics() {
    if (!track || track.noLyrics) return;
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
        if (atvDevice) { pollAppleTV(); setInterval(pollAppleTV, 4000); }
      });
  }
})();
