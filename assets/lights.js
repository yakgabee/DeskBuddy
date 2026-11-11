// Lights (Devices tab): Alexa lights switched through Voice Monkey routines, via server.py.
// Alexa doesn't tell Voice Monkey whether a light is on, so the card shows what DeskBuddy last sent.
(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ERRORS = {
    bad_token: 'Voice Monkey didn\'t accept the token. Run ./setup-pi.sh to fix it.',
    unknown_device: 'Voice Monkey doesn\'t know that trigger device. Check the name in ./setup-pi.sh.',
    rejected: 'Voice Monkey refused that. Check the trigger device and routine.',
    unreachable: 'Couldn\'t reach Voice Monkey. Check the internet connection.',
  };
  let lights = null;
  let busy = null;   // "light:action" being sent

  const time = s => new Date(s * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  function lastText(last, actions) {
    if (!last) return 'Tap On or Off';
    const label = (actions.find(a => a.id === last.action) || {}).label || last.action;
    const d = new Date(last.at * 1000);
    const when = d.toDateString() === new Date().toDateString() ? time(last.at)
      : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time(last.at)}`;
    return `${last.action === 'on' ? 'Turned on' : last.action === 'off' ? 'Turned off' : label} · ${when}`;
  }

  function render() {
    const box = $('lights');
    if (!lights) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="day-head"><b>Lights</b> · through Alexa</div>
      <div class="dev-grid">${lights.map((l, i) => {
        const on = l.last && l.last.action !== 'off';
        return `<article class="dev card light ${on ? 'lit' : ''}">
          <div class="dev-top">
            <div class="dev-icon">${icon('light', 28)}</div>
            <div class="grow"><div class="dev-name">${esc(l.name)}</div><div class="dev-sub">${esc(lastText(l.last, l.actions))}</div></div>
          </div>
          <div class="light-btns">${l.actions.map(a => `<button class="light-btn ${a.id}" data-light="${i}" data-action="${esc(a.id)}"
            ${busy ? 'disabled' : ''}>${busy === `${i}:${a.id}` ? '…' : esc(a.label)}</button>`).join('')}</div>
        </article>`;
      }).join('')}</div>`;
  }

  async function load() {
    try {
      const r = await fetch('/api/lights', { cache: 'no-store' });
      const d = await r.json();
      lights = d.lights || null;
    } catch (e) { /* not running under server.py */ }
    render();
  }

  $('lights').addEventListener('click', async e => {
    const b = e.target.closest('[data-action]');
    if (!b || busy) return;
    busy = `${b.dataset.light}:${b.dataset.action}`;
    render();
    let error = null;
    try {
      const r = await fetch('/api/lights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ light: Number(b.dataset.light), action: b.dataset.action }),
      });
      const d = await r.json();
      if (!d.ok) error = d.error;
    } catch (err) { error = 'unreachable'; }
    busy = null;
    if (error) {
      const t = $('toast');
      t.textContent = ERRORS[error] || ERRORS.unreachable;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 4000);
    }
    load();
  });

  load();
  setInterval(load, 60e3);   // keeps "Turned on at…" in step with other screens
  window.DeskLights = { reload: load };
})();
