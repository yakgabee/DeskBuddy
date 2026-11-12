// Spotify Connect: pick which device plays (your PC, phone, a speaker, a TV…).
// Only devices with Spotify open (or awake speakers) show up; that's how Spotify works.
(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ICONS = { computer: 'laptop', smartphone: 'phone', tablet: 'phone', speaker: 'speaker', castaudio: 'speaker',
    tv: 'tv', castvideo: 'tv', stb: 'tv', avr: 'speaker', automobile: 'car', gameconsole: 'gamepad' };
  const iconFor = type => ICONS[String(type).toLowerCase()] || 'speaker';
  let devices = null;
  let error = null;
  let switching = null;
  let current = null;   // name of the device playing now (from the player)

  let toastTimer;
  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
  }

  function render() {
    const list = $('spk-list');
    if (error) {
      list.innerHTML = `<p class="spk-msg">${error === 'rate' ? 'Spotify asked us to slow down. Try again in a moment.' : 'Couldn\'t reach Spotify.'}</p>`;
      return;
    }
    if (!devices) { list.innerHTML = '<p class="spk-msg">Looking for devices…</p>'; return; }
    if (!devices.length) {
      list.innerHTML = '<p class="spk-msg">No devices found. Open Spotify on your phone or computer (or turn on a speaker) and tap Refresh.</p>';
      return;
    }
    list.innerHTML = devices.map((d, i) => `
      <button class="spk-item ${d.active ? 'active' : ''}" data-i="${i}" ${d.restricted || switching ? 'disabled' : ''}>
        <span class="spk-icon">${icon(iconFor(d.type), 22)}</span>
        <span class="spk-text"><b>${esc(d.name)}</b><small class="${d.restricted || switching === d.id || d.active ? '' : 'type'}">${d.restricted ? 'Can\'t be controlled from here'
          : switching === d.id ? 'Switching…' : d.active ? 'Playing here' : esc(d.type)}</small></span>
        ${d.active ? `<span class="spk-check">${icon('check', 20)}</span>` : ''}
      </button>`).join('');
  }

  async function load() {
    error = null;
    try { devices = await Spotify.devices(); } catch (e) { error = e.code; }
    render();
  }

  async function choose(d) {
    if (d.active) return close();
    switching = d.id;
    render();
    try {
      await Spotify.transfer(d.id, true);
      toast(`Playing on ${d.name}`);
      current = d.name;
      show(d.name);
      close();
      window.dispatchEvent(new Event('deskbuddy:spotify-refresh'));
    } catch (e) {
      toast(e.code === 'premium' ? 'Switching devices needs Spotify Premium'
        : e.code === 'no_device' || e.code === 'forbidden' ? `${d.name} isn't available right now. Open Spotify on it and try again.`
        : 'Couldn\'t reach Spotify');
    }
    switching = null;
    render();
  }

  function open() {
    devices = null;
    $('spk-menu').hidden = false;
    render();
    load();
  }
  function close() { $('spk-menu').hidden = true; }

  // The pill on the Spotify tab: the device that's playing, or "Devices".
  function show(name) {
    current = name || null;
    $('dev-btn-name').textContent = current || 'Devices';
    $('btn-device').title = current ? `Playing on ${current}` : 'Choose a device';
  }

  $('btn-device').onclick = open;
  $('spk-close').onclick = close;
  $('spk-refresh').onclick = load;
  $('spk-menu').addEventListener('click', e => { if (e.target === $('spk-menu')) close(); });
  $('spk-list').addEventListener('click', e => {
    const b = e.target.closest('.spk-item');
    if (b && devices) choose(devices[Number(b.dataset.i)]);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('spk-menu').hidden) close(); });
  window.addEventListener('deskbuddy:tab', e => { if (e.detail !== 'spotify') close(); });
  window.DeskSpeakers = { open, close, show };
})();
