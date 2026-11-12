// Apple TV remote: a touch pad (tap an edge to move, the middle to select, or swipe),
// Back / Home / play-pause / volume, app buttons, and typing into the TV's search box.
// Opened from the Apple TV card on the Devices tab.
(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const device = window.DeskAppleTV ? DeskAppleTV.device() : null;
  if (!device) return;
  const host = device.host;
  const FAVORITES = window.DESKBUDDY_CONFIG.appletvApps || [];
  const input = $('rm-text');
  let status = null;
  let apps = null;        // installed apps [{name, id}], or null while loading
  let appsError = null;
  let poll = null;
  let typeTimer = null;
  let lastSent = '';

  let toastTimer;
  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3000);
  }

  async function post(body) {
    try {
      const r = await fetch('/api/appletv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, ...body }),
      });
      return await r.json();
    } catch (e) { return { error: 'failed' }; }
  }

  async function send(cmd, el) {
    if (el) { el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 150); }
    const r = await post({ action: cmd });
    if (r.error) toast(r.error === 'not_paired' ? 'Pair the Apple TV first (./setup-pi.sh)' : 'Couldn\'t reach the Apple TV');
    if (cmd === 'turn_on' || cmd === 'turn_off') setTimeout(refresh, 800);
  }

  // ---------- Touch pad ----------
  const pad = $('rm-pad');
  let start = null;
  pad.addEventListener('pointerdown', e => {
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    try { pad.setPointerCapture(e.pointerId); } catch (err) {}
  });
  pad.addEventListener('pointerup', e => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    let dir;
    if (Math.hypot(dx, dy) > 28) {
      dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');   // swipe
    } else {
      const r = pad.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2), cy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(cx, cy) < r.width * 0.22) dir = 'select';                                     // tap the middle
      else dir = Math.abs(cx) > Math.abs(cy) ? (cx > 0 ? 'right' : 'left') : (cy > 0 ? 'down' : 'up'); // tap an edge
    }
    pad.dataset.flash = dir;
    setTimeout(() => { if (pad.dataset.flash === dir) delete pad.dataset.flash; }, 180);
    send(dir);
  });
  pad.addEventListener('pointercancel', () => { start = null; });

  document.querySelectorAll('#atv-remote [data-cmd]').forEach(b => { b.onclick = () => send(b.dataset.cmd, b); });

  // ---------- Apps ----------
  const norm = t => String(t).toLowerCase().replace(/[^a-z0-9+]/g, '');
  function findApp(fav) {
    if (!apps) return null;
    for (const m of fav.match || [fav.name]) {
      const exact = apps.find(a => norm(a.name) === norm(m));
      if (exact) return exact;
    }
    for (const m of fav.match || [fav.name]) {
      const part = apps.find(a => norm(a.name).startsWith(norm(m)));
      if (part) return part;
    }
    return null;
  }

  function renderApps() {
    $('rm-apps').innerHTML = FAVORITES.map((f, i) => {
      const app = findApp(f);
      const missing = apps && !app;
      return `<button class="rm-app ${missing ? 'missing' : ''}" data-fav="${i}" ${missing ? 'disabled' : ''}
          style="--app:${esc(f.color || '#48484a')};--app-text:${esc(f.text || '#fff')}">
        <span class="rm-app-tile">${esc(f.name)}</span>
        <small>${missing ? 'Not installed' : apps ? esc(app.name) : appsError ? '' : '…'}</small>
      </button>`;
    }).join('');
    $('rm-allapps').innerHTML = apps
      ? `<button class="sr-back" data-back>${icon('arrowLeft', 18)}Back to remote</button>
         <div class="sr-head">All apps on the Apple TV</div><div class="rm-applist">${apps.map((a, i) =>
          `<button class="chip" data-app="${i}">${esc(a.name)}</button>`).join('')}</div>`
      : `<button class="sr-back" data-back>${icon('arrowLeft', 18)}Back to remote</button>
         <p class="search-msg">${appsError ? 'Couldn\'t load the apps.' : 'Loading apps…'}</p>`;
  }

  async function loadApps() {
    if (apps) return;
    try {
      const r = await fetch(`/api/appletv/apps?${new URLSearchParams({ host })}`, { cache: 'no-store' });
      const d = await r.json();
      if (d.apps) { apps = d.apps; appsError = null; } else appsError = d.error || 'failed';
    } catch (e) { appsError = 'failed'; }
    renderApps();
  }

  async function launch(app) {
    if (!app) return;
    toast(`Opening ${app.name}…`);
    if (status && status.power === 'off') await post({ action: 'turn_on' });
    const r = await post({ action: 'launch', app: app.id });
    if (r.error) toast(`Couldn't open ${app.name}`);
    showAll(false);
  }

  $('rm-apps').addEventListener('click', e => {
    const b = e.target.closest('[data-fav]');
    if (b) launch(findApp(FAVORITES[Number(b.dataset.fav)]));
  });
  $('rm-allapps').addEventListener('click', e => {
    const b = e.target.closest('[data-app]');
    if (b && apps) launch(apps[Number(b.dataset.app)]);
  });
  function showAll(on) {
    $('rm-allapps').hidden = !on;
    $('rm-body').hidden = on;
    if (on) { showKeyboard(false); loadApps(); }
  }
  $('rm-all-btn').onclick = () => showAll(true);
  $('rm-allapps').addEventListener('click', e => { if (e.target.closest('[data-back]')) showAll(false); });

  // ---------- Typing into the TV ----------
  const ROWS = [
    '1234567890'.split(''),
    'qwertyuiop'.split(''),
    [...'asdfghjkl'.split(''), "'"],
    [...'zxcvbnm'.split(''), '&', '-', 'back'],
    ['hide', 'space', 'done'],
  ];
  const KEY_LABEL = { back: icon('backspace', 20), hide: icon('keyboard', 20), space: 'space', done: 'Done' };
  $('rm-osk').innerHTML = ROWS.map(row => `<div class="osk-row">${row.map(k =>
    `<button class="osk-key ${KEY_LABEL[k] ? `osk-${k}` : ''}" data-key="${esc(k)}" tabindex="-1">${KEY_LABEL[k] || esc(k)}</button>`).join('')}</div>`).join('');
  $('rm-osk').addEventListener('pointerdown', e => {
    const key = e.target.closest('.osk-key')?.dataset.key;
    if (!key) return;
    e.preventDefault();
    if (key === 'hide' || key === 'done') return showKeyboard(false);
    if (key === 'back') input.value = input.value.slice(0, -1);
    else input.value += key === 'space' ? ' ' : key;
    onType();
  });

  function showKeyboard(on) {
    $('rm-osk').hidden = !on;
    $('atv-remote').classList.toggle('typing', on);
    if (on) { $('rm-allapps').hidden = true; $('rm-body').hidden = true; }
    else if ($('rm-allapps').hidden) $('rm-body').hidden = false;
    renderHint();
  }

  // Sends the whole text a moment after you stop typing (it replaces what's in the TV's box).
  function onType() {
    $('rm-text-clear').hidden = !input.value;
    clearTimeout(typeTimer);
    typeTimer = setTimeout(sendText, 300);
  }
  async function sendText() {
    const text = input.value;
    if (text === lastSent) return;
    lastSent = text;
    const r = await post({ action: 'text', text });
    if (r.error === 'no_text_field') { lastSent = null; renderHint(true); }
  }
  input.addEventListener('pointerdown', () => showKeyboard(true));
  input.addEventListener('input', onType);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { sendText(); showKeyboard(false); } });
  $('rm-text-clear').onclick = () => { input.value = ''; onType(); };

  function renderHint(failed) {
    const noField = failed || (status && status.keyboard === 'unfocused');
    const typing = !$('rm-osk').hidden || !!input.value;
    $('rm-hint').hidden = !(typing && noField);
    $('rm-hint').textContent = 'Open a search box on the TV first (like the search in YouTube), then type here.';
  }

  // ---------- Status ----------
  function render() {
    const s = status || {};
    const awake = s.state === 'ok' && s.power !== 'off';
    $('rm-name').textContent = device.name || 'Apple TV';
    $('rm-np').textContent = s.state === 'not_paired' ? 'Not paired yet: run ./setup-pi.sh'
      : s.state === 'not_installed' ? 'Apple TV support isn\'t installed: run ./setup-pi.sh'
      : s.state !== 'ok' ? 'Can\'t reach the Apple TV'
      : !awake ? 'Sleeping'
      : DeskAppleTV.isActive(s) ? `${s.deviceState === 'playing' ? 'Playing' : 'Paused'}: ${s.title || s.app}${s.app && s.title ? ` · ${s.app}` : ''}`
      : s.app ? `In ${s.app}` : 'On';
    $('rm-power').innerHTML = `${icon('power', 14)}${awake ? 'Sleep' : 'Turn on'}`;
    $('rm-power').onclick = () => send(awake ? 'turn_off' : 'turn_on');
    $('atv-remote').classList.toggle('asleep', !awake);
    renderHint();
  }

  async function refresh() {
    status = await DeskAppleTV.status(host);
    render();
  }

  // ---------- Open / close ----------
  function open() {
    $('atv-remote').hidden = false;
    showAll(false);
    showKeyboard(false);
    render();
    refresh();
    renderApps();
    loadApps();
    clearInterval(poll);
    poll = setInterval(refresh, 3000);
  }
  function close() {
    $('atv-remote').hidden = true;
    clearInterval(poll);
    input.blur();
  }
  $('rm-close').onclick = close;
  document.addEventListener('keydown', e => {
    if ($('atv-remote').hidden || document.activeElement === input) return;
    const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', Backspace: 'menu' };
    if (e.key === 'Escape') close();
    else if (keys[e.key]) { e.preventDefault(); send(keys[e.key]); }
  });
  window.addEventListener('deskbuddy:tab', e => { if (e.detail !== 'devices') close(); });
  window.DeskRemote = { open, close };
})();
