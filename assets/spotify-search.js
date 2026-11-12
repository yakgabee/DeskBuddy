// Spotify search: a full-screen search with an on-screen keyboard (the Pi has no keyboard).
// Tap a song or artist to play it; open a playlist or album to see its songs.
// "+" adds a song to your queue.
(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RECENT_KEY = 'deskbuddy.spotify.recent';
  const SECTIONS = [['tracks', 'Songs'], ['artists', 'Artists'], ['albums', 'Albums'], ['playlists', 'Playlists']];
  const input = $('search-input');
  let results = null;
  let mine = null;          // your playlists (null = not loaded yet)
  let detail = null;        // the playlist/album being looked at: { item, songs, total, error }
  let kind = 'all';
  let seq = 0;
  let debounce;
  let pausedUntil = 0;

  let toastTimer;
  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
  }

  const recent = {
    get() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } },
    add(q) {
      const list = [q, ...this.get().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
    },
  };

  // ---------- On-screen keyboard ----------
  const ROWS = [
    '1234567890'.split(''),
    'qwertyuiop'.split(''),
    [...'asdfghjkl'.split(''), "'"],
    [...'zxcvbnm'.split(''), '&', '-', 'back'],
    ['hide', 'space', 'done'],
  ];
  const KEY_LABEL = { back: icon('backspace', 20), hide: icon('keyboard', 20), space: 'space', done: 'Done' };
  $('osk').innerHTML = ROWS.map(row => `<div class="osk-row">${row.map(k =>
    `<button class="osk-key ${KEY_LABEL[k] ? `osk-${k}` : ''}" data-key="${esc(k)}" tabindex="-1">${KEY_LABEL[k] || esc(k)}</button>`).join('')}</div>`).join('');
  // pointerdown keeps focus in the search box and feels instant on a touchscreen.
  $('osk').addEventListener('pointerdown', e => {
    const key = e.target.closest('.osk-key')?.dataset.key;
    if (!key) return;
    e.preventDefault();
    if (key === 'hide' || key === 'done') return showKeyboard(false);
    if (key === 'back') input.value = input.value.slice(0, -1);
    else input.value += key === 'space' ? ' ' : key;
    onInput();
  });
  function showKeyboard(on) { $('search').classList.toggle('kb-hidden', !on); }

  // ---------- Searching ----------
  function onInput() {
    $('search-clear').hidden = !input.value;
    if (detail) { detail = null; render(); }
    clearTimeout(debounce);
    debounce = setTimeout(run, 350);
  }

  async function run() {
    const q = input.value.trim();
    const ticket = ++seq;
    if (!q) { results = null; loadMine(); return render(); }
    if (Date.now() < pausedUntil) return;
    $('search-results').classList.add('loading');
    try {
      const r = await Spotify.search(q);
      if (ticket !== seq) return;         // a newer search already started
      results = r;
      render();
    } catch (e) {
      if (ticket !== seq) return;
      if (e.code === 'rate') pausedUntil = Date.now() + e.retryAfter * 1000;
      $('search-results').innerHTML = `<p class="search-msg">${e.code === 'auth' ? 'Connect Spotify first.'
        : e.code === 'rate' ? 'Spotify asked us to slow down. Try again in a moment.' : 'Couldn\'t reach Spotify.'}</p>`;
    } finally {
      if (ticket === seq) $('search-results').classList.remove('loading');
    }
  }

  const time = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function row(item, i, section) {
    const art = item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : icon(item.kind === 'artist' ? 'headphones' : 'music', 20);
    return `<div class="sr-row" data-section="${section}" data-i="${i}">
      <span class="sr-art ${item.kind === 'artist' ? 'round' : ''}">${art}</span>
      <span class="sr-text"><b>${esc(item.title)}${item.explicit ? '<i class="sr-e">E</i>' : ''}</b><small>${esc(item.sub)}</small></span>
      ${item.kind === 'track' ? `<span class="sr-time">${time(item.duration)}</span>
        <button class="sr-queue" data-queue aria-label="Add to queue">${icon('plus', 18)}</button>`
        : item.kind === 'playlist' || item.kind === 'album' ? `<span class="sr-more">${icon('chevronRight', 20)}</span>` : ''}
    </div>`;
  }

  async function loadMine() {
    if (mine || !Spotify.canReadPlaylists()) return;
    try { mine = await Spotify.myPlaylists(); } catch (e) { return; }
    if (!results && !detail && !$('search').hidden) render();
  }

  function render() {
    const box = $('search-results');
    $('search-tabs').hidden = !!detail || !results;
    if (detail) return renderDetail();
    if (!results) {
      const list = recent.get();
      const playlists = !Spotify.canReadPlaylists()
        ? `<div class="sr-head">Your playlists</div><p class="search-msg">Reconnect Spotify once to see your playlists here.
            <button class="chip" data-reconnect>Reconnect Spotify</button></p>`
        : mine && mine.length ? `<section class="sr-section"><div class="sr-head">Your playlists</div>
            <div class="sr-list">${mine.map((it, i) => row(it, i, 'mine')).join('')}</div></section>` : '';
      box.innerHTML = (list.length
        ? `<div><div class="sr-head">Recent searches</div><div class="sr-recent">${list.map(q => `<button class="chip" data-recent="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`
        : '<p class="search-msg">Search for a song, artist, album or playlist.</p>') + playlists;
      return;
    }
    const sections = SECTIONS.filter(([k]) => (kind === 'all' || kind === k) && results[k].length);
    box.innerHTML = sections.length ? sections.map(([k, label]) => {
      const items = kind === 'all' ? results[k].slice(0, k === 'tracks' ? 6 : 4) : results[k];
      return `<section class="sr-section">
        ${kind === 'all' ? `<div class="sr-head">${label}</div>` : ''}
        <div class="sr-list">${items.map((it, i) => row(it, i, k)).join('')}</div>
      </section>`;
    }).join('') : '<p class="search-msg">No results.</p>';
    box.scrollTop = 0;
  }

  // ---------- A playlist or album's songs ----------
  async function openDetail(item) {
    detail = { item, songs: [], total: 0, loading: true };
    showKeyboard(false);
    render();
    await loadMore();
  }

  async function loadMore() {
    const d = detail;
    d.loading = true;
    try {
      const page = await Spotify.songs(d.item, d.songs.length);
      d.songs.push(...page.songs);
      d.total = page.total;
    } catch (e) {
      d.error = e.code;
    }
    d.loading = false;
    if (detail === d) render();
  }

  function renderDetail() {
    const { item, songs, total, error, loading } = detail;
    const art = item.image ? `<img src="${esc(item.image)}" alt="">` : icon('music', 30);
    const count = total ? `${total} song${total === 1 ? '' : 's'}` : '';
    const body = error === 'forbidden'
      ? '<p class="search-msg">Spotify only shows the songs in playlists you made or collaborate on. You can still play it.</p>'
      : error ? '<p class="search-msg">Couldn\'t load the songs. Try again in a moment.</p>'
      : songs.length ? `<div class="sr-list single">${songs.map((t, i) => row(t, i, 'detail')).join('')}</div>
          ${songs.length < total ? `<button class="chip sr-load" data-more ${loading ? 'disabled' : ''}>${loading ? 'Loading…' : 'Show more'}</button>` : ''}`
      : loading ? '<p class="search-msg">Loading songs…</p>' : '<p class="search-msg">No songs.</p>';
    $('search-results').innerHTML = `
      <button class="sr-back" data-back>${icon('arrowLeft', 18)}Back</button>
      <div class="sr-detail-head">
        <span class="sr-art big">${art}</span>
        <span class="sr-text"><small>${item.kind === 'album' ? 'Album' : 'Playlist'}</small><b>${esc(item.title)}</b>
          <small>${esc([item.kind === 'album' ? item.sub : '', count].filter(Boolean).join(' · '))}</small></span>
        <button class="sr-play" data-playall>${icon('play', 18)}Play</button>
      </div>
      ${body}`;
  }

  async function play(item, startAt = null) {
    if (input.value.trim()) recent.add(input.value.trim());
    try {
      await Spotify.playItem(item, startAt);
      toast(`Playing ${startAt ? detail?.songs.find(t => t.uri === startAt)?.title || item.title : item.title}`);
      close();
      window.dispatchEvent(new Event('deskbuddy:spotify-refresh'));
    } catch (e) {
      toast(e.code === 'premium' ? 'Playing music needs Spotify Premium'
        : e.code === 'no_device' ? 'Open Spotify on your PC or phone first, then try again'
        : 'Couldn\'t reach Spotify');
    }
  }

  async function addToQueue(item, btn) {
    if (input.value.trim()) recent.add(input.value.trim());
    try {
      await Spotify.queue(item.uri);
      btn.innerHTML = icon('check', 18);
      btn.classList.add('done');
      toast(`Added ${item.title} to your queue`);
    } catch (e) {
      toast(e.code === 'premium' ? 'The queue needs Spotify Premium'
        : e.code === 'no_device' ? 'Start playing something first, then add to the queue'
        : 'Couldn\'t reach Spotify');
    }
  }

  $('search-results').addEventListener('click', e => {
    const recentBtn = e.target.closest('[data-recent]');
    if (recentBtn) { input.value = recentBtn.dataset.recent; $('search-clear').hidden = false; return run(); }
    if (e.target.closest('[data-reconnect]')) return Spotify.login();
    if (e.target.closest('[data-back]')) { detail = null; return render(); }
    if (e.target.closest('[data-playall]')) return play(detail.item);
    if (e.target.closest('[data-more]')) { e.target.closest('[data-more]').disabled = true; return loadMore(); }
    const r = e.target.closest('.sr-row');
    if (!r) return;
    const s = r.dataset.section, i = Number(r.dataset.i);
    const item = s === 'mine' ? mine[i] : s === 'detail' ? detail.songs[i] : results[s][i];
    const q = e.target.closest('[data-queue]');
    if (q) { if (!q.classList.contains('done')) addToQueue(item, q); return; }
    if (s === 'detail') return play(detail.item, item.uri);   // play the playlist from this song
    if (item.kind === 'playlist' || item.kind === 'album') return openDetail(item);
    play(item);
  });
  // Scrolling the results tucks the keyboard away to show more of them.
  $('search-results').addEventListener('touchmove', () => showKeyboard(false), { passive: true });
  $('search-results').addEventListener('wheel', () => showKeyboard(false), { passive: true });
  $('search-results').addEventListener('dragscroll', () => showKeyboard(false));

  $('search-tabs').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    kind = chip.dataset.kind;
    detail = null;
    document.querySelectorAll('#search-tabs .chip').forEach(c => c.classList.toggle('active', c === chip));
    render();
  });

  input.addEventListener('input', onInput);
  input.addEventListener('pointerdown', () => showKeyboard(true));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(debounce); run(); showKeyboard(false); } });
  $('search-clear').onclick = () => { input.value = ''; onInput(); showKeyboard(true); input.focus(); };

  // ---------- Open / close ----------
  function open() {
    $('search').hidden = false;
    showKeyboard(true);
    detail = null;
    render();
    loadMine();
    input.focus();
  }
  function close() {
    $('search').hidden = true;
    input.blur();
  }
  $('btn-search').onclick = open;
  $('search-close').onclick = close;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('search').hidden) close(); });
  // Going back to the clock after a while idle closes the search too.
  window.addEventListener('deskbuddy:tab', e => { if (e.detail !== 'spotify') close(); });
  window.DeskSearch = { open, close };
})();
