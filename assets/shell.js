// The frame around the tabs: date, big clock, the line under it, and going back
// to the clock when nobody has touched the screen for a while.
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

  // ---------- Tabs: keep the address in sync; back to the clock after 2 minutes ----------
  const IDLE = 2 * 60 * 1000;
  let idleTimer;
  function onTab(name) {
    document.body.classList.toggle('on-clock', name === 'clock');
    history.replaceState(null, '', name === 'clock' ? location.pathname + location.search : `#${name}`);
    resetIdle();
  }
  function resetIdle() {
    clearTimeout(idleTimer);
    if (DeskTabs.current !== 'clock') idleTimer = setTimeout(() => {
      if ($('lyrics').classList.contains('open')) return resetIdle();
      DeskTabs.show('clock');
    }, IDLE);
  }
  window.addEventListener('deskbuddy:tab', e => onTab(e.detail));
  ['pointerdown', 'keydown', 'wheel'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));
  onTab(DeskTabs.current);
  $('downloads').onclick = () => DeskTabs.show('downloads');

  // ---------- Power button: screen off, restart, shut down ----------
  const menu = $('power-menu');
  let armed = null; // restart / shut down need a second tap
  function closeMenu() {
    menu.hidden = true;
    armed = null;
    menu.querySelectorAll('[data-power]').forEach(b => {
      b.classList.remove('confirm');
      b.textContent = { screen: 'Turn screen off', restart_app: 'Restart DeskBuddy', quit_app: 'Close DeskBuddy',
        reboot: 'Restart Pi', shutdown: 'Shut down Pi', cancel: 'Cancel' }[b.dataset.power];
    });
  }
  let openedAt = 0;
  $('power').onclick = () => { closeMenu(); menu.hidden = false; openedAt = Date.now(); };
  menu.addEventListener('click', async e => {
    // Some touchscreens send a second click right after the first; don't let it
    // close (or press something in) the menu that just opened.
    if (Date.now() - openedAt < 400) return;
    const b = e.target.closest('[data-power]');
    if (!b) return closeMenu();               // tapped outside the menu
    const act = b.dataset.power;
    if (act === 'cancel') return closeMenu();
    if (act === 'screen') {
      closeMenu();
      $('screen-off').hidden = false;
      return;
    }
    if (act === 'restart_app') {               // safe: one tap, comes straight back
      b.textContent = 'Restarting DeskBuddy…';
      try {
        const r = await fetch('/api/power', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: act }) });
        if (!r.ok) throw new Error();
      } catch (err) {
        location.reload();                     // the server isn't answering: at least reload the page
      }
      return;
    }
    if (armed !== act) {                       // first tap: ask to confirm
      closeMenu();
      menu.hidden = false;
      armed = act;
      b.classList.add('confirm');
      b.textContent = act === 'reboot' ? 'Tap again to restart' : act === 'quit_app' ? 'Tap again to close' : 'Tap again to shut down';
      return;
    }
    b.textContent = act === 'reboot' ? 'Restarting…' : act === 'quit_app' ? 'Closing…' : 'Shutting down…';
    try {
      const r = await fetch('/api/power', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: act }) });
      if (!r.ok) throw new Error();
    } catch (err) {
      closeMenu();
      const t = $('toast');
      t.textContent = 'The Pi didn\'t allow that. See "Power button" in the README.';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 4000);
    }
  });
  // Any tap wakes the screen (and doesn't also press whatever is underneath).
  $('screen-off').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); $('screen-off').hidden = true; resetIdle(); });

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
  $('glance-music').onclick = () => DeskTabs.show('spotify');
  $('glance-event').onclick = () => DeskTabs.show('calendar');
})();
