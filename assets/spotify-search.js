// Spotify search: a full-screen search with an on-screen keyboard (the Pi has no keyboard).
// Tap a song, album, artist or playlist to play it; "+" adds a song to your queue.
(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RECENT_KEY = 'deskbuddy.spotify.recent';
  const SECTIONS = [['tracks', 'Songs'], ['artists', 'Artists'], ['albums', 'Albums'], ['playlists', 'Playlists']];
  const input = $('search-input');
  let results = null;
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
    clearTimeout(debounce);
    debounce = setTimeout(run, 350);
  }

  async function run() {
    const q = input.value.trim();
    const mine = ++seq;
    if (!q) { results = null; return render(); }
    if (Date.now() < pausedUntil) return;
    $('search-results').classList.add('loading');
    try {
      const r = await Spotify.search(q);
      if (mine !== seq) return;           // a newer search already started
      results = r;
      render();
    } catch (e) {
      if (mine !== seq) return;
      if (e.code === 'rate') pausedUntil = Date.now() + e.retryAfter * 1000;
      $('search-results').innerHTML = `<p class="search-msg">${e.code === 'auth' ? 'Connect Spotify first.'
        : e.code === 'rate' ? 'Spotify asked us to slow down. Try again in a moment.' : 'Couldn\'t reach Spotify.'}</p>`;
    } finally {
      if (mine === seq) $('search-results').classList.remove('loading');
    }
  }

  const time = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function row(item, i, section) {
    const art = item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : icon(item.kind === 'artist' ? 'headphones' : 'music', 20);
    return `<div class="sr-row" data-section="${section}" data-i="${i}">
      <span class="sr-art ${item.kind === 'artist' ? 'round' : ''}">${art}</span>
      <span class="sr-text"><b>${esc(item.title)}${item.explicit ? '<i class="sr-e">E</i>' : ''}</b><small>${esc(item.sub)}</small></span>
      ${item.kind === 'track' ? `<span class="sr-time">${time(item.duration)}</span>
        <button class="sr-queue" data-queue aria-label="Add to queue">${icon('plus', 18)}</button>` : ''}
    </div>`;
  }

  function render() {
    const box = $('search-results');
    if (!results) {
      const list = recent.get();
      box.innerHTML = list.length
        ? `<div class="sr-head">Recent searches</div><div class="sr-recent">${list.map(q => `<button class="chip" data-recent="${esc(q)}">${esc(q)}</button>`).join('')}</div>`
        : '<p class="search-msg">Search for a song, artist, album or playlist.</p>';
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

  async function play(item) {
    recent.add(input.value.trim());
    try {
      await Spotify.playItem(item);
      toast(`Playing ${item.title}`);
      close();
      window.dispatchEvent(new Event('deskbuddy:spotify-refresh'));
    } catch (e) {
      toast(e.code === 'premium' ? 'Playing music needs Spotify Premium'
        : e.code === 'no_device' ? 'Open Spotify on your PC or phone first, then try again'
        : 'Couldn\'t reach Spotify');
    }
  }

  async function addToQueue(item, btn) {
    recent.add(input.value.trim());
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
    const r = e.target.closest('.sr-row');
    if (!r) return;
    const item = results[r.dataset.section][Number(r.dataset.i)];
    const q = e.target.closest('[data-queue]');
    if (q) { if (!q.classList.contains('done')) addToQueue(item, q); return; }
    play(item);
  });
  // Scrolling the results tucks the keyboard away to show more of them.
  $('search-results').addEventListener('touchmove', () => showKeyboard(false), { passive: true });
  $('search-results').addEventListener('wheel', () => showKeyboard(false), { passive: true });

  $('search-tabs').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    kind = chip.dataset.kind;
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
    render();
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
