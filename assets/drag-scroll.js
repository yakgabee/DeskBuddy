// Drag to scroll. On many Raspberry Pi touchscreens a finger reaches Chromium as a
// mouse, which can click but not scroll. This lets a mouse-style drag scroll any
// scrollable list (with a little momentum), and a drag never counts as a tap.
// Real touch and the mouse wheel keep working as normal.
(() => {
  const THRESHOLD = 22;       // px of movement before a press becomes a drag (a finger wobbles a bit on a tap)
  const SKIP = 'input, textarea, select, .osk, .vol-slider, .progress-bar, .dpad';
  let press = null;           // { id, x, y, el, axis, dragging, samples }
  let glide = null;
  let swallowClick = false;

  function scroller(start, axis) {
    for (let el = start; el && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const ok = axis === 'y'
        ? /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1
        : /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      if (ok) return el;
    }
    return null;
  }

  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0 || e.target.closest(SKIP)) return;
    if (glide) { cancelAnimationFrame(glide); glide = null; }
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target, el: null, dragging: false, samples: [] };
  }, true);

  document.addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.dragging) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      press.axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
      press.el = scroller(press.target, press.axis);
      if (!press.el) { press = null; return; }
      press.dragging = true;
      press.startScroll = press.axis === 'y' ? press.el.scrollTop : press.el.scrollLeft;
      press.el.style.scrollBehavior = 'auto';
      try { press.el.setPointerCapture(e.pointerId); } catch (err) {}
      document.documentElement.classList.add('dragging');
    }
    const delta = press.axis === 'y' ? dy : dx;
    if (press.axis === 'y') press.el.scrollTop = press.startScroll - delta;
    else press.el.scrollLeft = press.startScroll - delta;
    press.samples.push([performance.now(), delta]);
    if (press.samples.length > 6) press.samples.shift();
    // Let other code know the list moved (e.g. search tucks its keyboard away).
    press.el.dispatchEvent(new Event('dragscroll'));
  }, true);

  function release(e) {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    if (!p.dragging) return;
    document.documentElement.classList.remove('dragging');
    swallowClick = true;                  // the click that follows a drag isn't a tap
    setTimeout(() => { swallowClick = false; }, 0);
    // Momentum: keep going at the release speed, slowing down smoothly.
    const s = p.samples, now = performance.now();
    const recent = s.filter(([t]) => now - t < 100);
    if (recent.length < 2) return p.el.style.removeProperty('scroll-behavior');
    let v = (recent[recent.length - 1][1] - recent[0][1]) / Math.max(1, recent[recent.length - 1][0] - recent[0][0]); // px/ms
    let last = now;
    const step = t => {
      const dt = t - last; last = t;
      v *= Math.pow(0.95, dt / 16);
      if (Math.abs(v) < 0.02) { glide = null; p.el.style.removeProperty('scroll-behavior'); return; }
      if (p.axis === 'y') p.el.scrollTop -= v * dt; else p.el.scrollLeft -= v * dt;
      glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  }
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);

  document.addEventListener('click', e => {
    if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; }
  }, true);
})();
