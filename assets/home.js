(() => {
  const $ = id => document.getElementById(id);

  // Clock
  DeskClock.start({ time: $('time'), date: $('date'), greeting: $('greeting') });

  // Smart home summary
  const s = DeskDevices.summary(DeskDevices.load());
  $('stat-on').textContent = s.active;
  $('stat-temp').textContent = s.temp;
  $('stat-lock').textContent = s.door;

  // Now playing
  const player = MockPlayer;
  const fmt = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  let renderedIndex = -1;
  let activeLine = -1;

  function renderTrack() {
    const t = player.current;
    document.documentElement.style.setProperty('--cover-gradient', t.gradient);
    $('cover-art').textContent = t.emoji;
    $('np-title').textContent = t.title;
    $('np-artist').textContent = t.artist;
    $('np-album').textContent = t.album;
    $('t-dur').textContent = fmt(t.duration);
    $('lyrics-cover').textContent = t.emoji;
    $('lyrics-title').textContent = t.title;
    $('lyrics-artist').textContent = t.artist;
    $('lyrics-body').innerHTML = t.lyrics
      .map(([, line], i) => `<p class="lyric-line" data-i="${i}">${line}</p>`)
      .join('');
    activeLine = -1;
    renderedIndex = player.index;
  }

  function renderProgress() {
    const t = player.current;
    $('progress-fill').style.width = `${(player.position / t.duration) * 100}%`;
    $('t-cur').textContent = fmt(player.position);
    $('btn-play').textContent = player.playing ? '⏸' : '▶';
    $('now-playing').classList.toggle('paused', !player.playing);

    // Synced lyrics highlight
    let idx = 0;
    t.lyrics.forEach(([ts], i) => { if (player.position >= ts) idx = i; });
    if (idx !== activeLine) {
      activeLine = idx;
      document.querySelectorAll('.lyric-line').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
        el.classList.toggle('past', i < idx);
      });
      const el = document.querySelector(`.lyric-line[data-i="${idx}"]`);
      if (el && $('lyrics').classList.contains('open')) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }

  function render() {
    if (renderedIndex !== player.index) renderTrack();
    renderProgress();
  }

  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    player.tick((now - last) / 1000);
    last = now;
    render();
  }, 250);
  render();

  $('btn-play').onclick = () => { player.toggle(); render(); };
  $('btn-next').onclick = () => { player.next(); render(); };
  $('btn-prev').onclick = () => { player.prev(); render(); };

  // Lyrics overlay
  const openLyrics = () => {
    $('lyrics').classList.add('open');
    activeLine = -1; // force re-scroll
    renderProgress();
  };
  const closeLyrics = () => $('lyrics').classList.remove('open');
  $('cover').onclick = openLyrics;
  $('lyrics-close').onclick = closeLyrics;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLyrics(); });
})();
