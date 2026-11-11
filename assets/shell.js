// The home screen: wallpaper, date, big clock, the line under it, and the Tabs sheet.
(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.DESKBUDDY_CONFIG.clock || {};

  // ---------- Clock & date: "11:49", "Tuesday, November 10th 2026" ----------
  const ordinal = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  function tick() {
    const now = new Date();
    let h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    if (cfg.hours === 24) h = String(h).padStart(2, '0'); else h = h % 12 || 12;
    const t = `${h}:${m}`;
    if ($('time').textContent !== t) $('time').textContent = t;
    const d = `${now.toLocaleDateString('en-US', { weekday: 'long' })}, ${now.toLocaleDateString('en-US', { month: 'long' })} ${ordinal(now.getDate())} ${now.getFullYear()}`;
    if ($('date').textContent !== d) $('date').textContent = d;
  }
  tick();
  setInterval(tick, 1000);

  // ---------- Tabs sheet ----------
  const sheet = $('sheet');
  const IDLE_CLOSE = 2 * 60 * 1000; // back to the clock after 2 minutes untouched
  let idleTimer;
  const isOpen = () => sheet.classList.contains('open');
  function resetIdle() {
    clearTimeout(idleTimer);
    if (isOpen()) idleTimer = setTimeout(() => {
      if (!$('lyrics').classList.contains('open')) closeSheet();
      else resetIdle();
    }, IDLE_CLOSE);
  }
  function openSheet(tab) {
    if (tab) DeskTabs.show(tab);
    sheet.classList.add('open');
    document.body.classList.add('sheet-open');
    history.replaceState(null, '', `#${DeskTabs.current}`);
    resetIdle();
  }
  function closeSheet() {
    sheet.classList.remove('open');
    document.body.classList.remove('sheet-open');
    history.replaceState(null, '', location.pathname + location.search);
    clearTimeout(idleTimer);
  }
  $('open-tabs').onclick = () => openSheet();
  $('close-tabs').onclick = closeSheet;
  $('downloads').onclick = () => openSheet('downloads');
  window.addEventListener('deskbuddy:tab', e => { if (isOpen()) history.replaceState(null, '', `#${e.detail}`); });
  ['pointerdown', 'keydown', 'wheel'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));
  if (DeskTabs.list.includes(location.hash.slice(1))) openSheet(location.hash.slice(1));

  // Swipe up on the clock to open, swipe down on the sheet's top bar to close.
  let startY = null;
  $('screen').addEventListener('pointerdown', e => { startY = e.clientY; });
  $('screen').addEventListener('pointerup', e => { if (startY !== null && startY - e.clientY > 60) openSheet(); startY = null; });
  let sheetY = null;
  sheet.querySelector('.sheet-top').addEventListener('pointerdown', e => { sheetY = e.clientY; });
  sheet.querySelector('.sheet-top').addEventListener('pointerup', e => { if (sheetY !== null && e.clientY - sheetY > 60) closeSheet(); sheetY = null; });

  // ---------- The line under the clock: what's playing, what's next ----------
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.addEventListener('deskbuddy:nowplaying', e => {
    const np = e.detail;
    const show = np && np.playing && np.title;
    $('glance-music').hidden = !show;
    if (show) $('glance-music').innerHTML = `${icon(np.source === 'appletv' ? 'tv' : 'music', 18)}<span>${esc(np.title)}${np.artist ? ` — ${esc(np.artist)}` : ''}</span>`;
  });
  window.addEventListener('deskbuddy:nextevent', e => {
    const ev = e.detail;
    $('glance-event').hidden = !ev;
    if (ev) $('glance-event').innerHTML = `${icon('calendar', 18)}<span>${esc(ev.when)} · ${esc(ev.title)}</span>`;
  });
  $('glance-music').onclick = () => openSheet('spotify');
  $('glance-event').onclick = () => openSheet('calendar');

  // ---------- Wallpaper (your Wallpaper Engine wallpaper, synced from the PC) ----------
  const img = $('wall-img'), video = $('wall-video');
  let current = '';
  async function loadWallpaper() {
    let w;
    try {
      const r = await fetch('/api/wallpaper', { cache: 'no-store' });
      w = r.ok ? await r.json() : null;
    } catch (e) { return; } // keep whatever is showing
    const key = w && w.state === 'ok' ? `${w.image || ''}|${w.video || ''}` : '';
    if (key === current) return;
    current = key;
    if (!key) { img.classList.remove('shown'); video.classList.remove('shown'); video.removeAttribute('src'); return; }
    if (w.image) {
      img.onload = () => { img.classList.add('shown'); if (!w.video) video.classList.remove('shown'); };
      img.src = w.image;
    } else img.classList.remove('shown');
    if (w.video) {
      video.oncanplay = () => { video.classList.add('shown'); video.play().catch(() => {}); };
      video.src = w.video;
      video.load();
    } else {
      video.classList.remove('shown');
      video.removeAttribute('src');
      video.load();
    }
  }
  loadWallpaper();
  setInterval(loadWallpaper, 60 * 1000);
})();
