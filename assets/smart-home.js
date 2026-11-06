(() => {
  const $ = id => document.getElementById(id);
  DeskClock.start({ short: $('sh-clock') });

  let devices = DeskDevices.load();
  let room = 'All';

  const ICON_ON = {
    light: '#f59e0b', plug: '#3b82f6', thermostat: '#f97316',
    lock: '#22c55e', camera: '#ef4444', blinds: '#0ea5e9',
  };

  function stateText(d) {
    switch (d.type) {
      case 'light': return d.on ? `On · ${d.brightness}%` : 'Off';
      case 'plug': return d.on ? 'On' : 'Off';
      case 'thermostat': return `${d.mode} · set to ${d.target}°F`;
      case 'lock': return d.on ? 'Locked' : 'Unlocked';
      case 'camera': return d.on ? 'Recording' : 'Off';
      case 'blinds': return d.position === 0 ? 'Closed' : `Open ${d.position}%`;
    }
  }

  function body(d) {
    switch (d.type) {
      case 'light':
        return `<input type="range" min="1" max="100" value="${d.brightness}" data-act="brightness" ${d.on ? '' : 'disabled'} aria-label="Brightness">`;
      case 'thermostat':
        return `<div class="thermo"><div class="thermo-temp">${d.target}°</div>
          <div class="thermo-btns"><button class="round-btn" data-act="down">−</button><button class="round-btn" data-act="up">+</button></div></div>`;
      case 'camera':
        return `<div class="cam-preview">${d.on ? '<span class="live">Live</span>Camera feed' : 'Camera off'}</div>`;
      case 'blinds':
        return `<input type="range" min="0" max="100" value="${d.position}" data-act="position" aria-label="Blinds position">`;
      default:
        return '';
    }
  }

  function render() {
    const rooms = ['All', ...new Set(devices.map(d => d.room))];
    $('rooms').innerHTML = rooms.map(r =>
      `<button class="room-chip ${r === room ? 'active' : ''}" data-room="${r}">${r}</button>`).join('');

    const list = room === 'All' ? devices : devices.filter(d => d.room === room);
    $('devices').innerHTML = list.map(d => {
      const hasToggle = d.type !== 'thermostat' && d.type !== 'blinds';
      const isOn = d.type === 'blinds' ? d.position > 0 : d.on;
      return `<article class="device card ${isOn ? 'on' : ''}" data-id="${d.id}" style="--icon-on:${ICON_ON[d.type]}">
        <div class="device-top">
          <div class="device-icon">${icon(d.type === 'lock' && !d.on ? 'unlock' : d.icon)}</div>
          ${hasToggle ? `<button class="toggle ${d.on ? 'on' : ''}" data-act="toggle" aria-label="Toggle ${d.name}"></button>` : ''}
        </div>
        <div>
          <div class="device-name">${d.name}</div>
          <div class="device-state">${room === 'All' ? d.room + ' · ' : ''}${stateText(d)}</div>
        </div>
        <div class="device-body">${body(d)}</div>
      </article>`;
    }).join('');

    const s = DeskDevices.summary(devices);
    $('sh-summary').textContent = `${s.active} devices on · Thermostat ${s.temp} · Front door ${s.door.toLowerCase()}`;
  }

  function update(id, fn) {
    const d = devices.find(x => x.id === id);
    if (!d) return;
    fn(d);
    DeskDevices.save(devices);
    render();
  }

  $('rooms').addEventListener('click', e => {
    const b = e.target.closest('[data-room]');
    if (b) { room = b.dataset.room; render(); }
  });

  $('devices').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.closest('.device').dataset.id;
    update(id, d => {
      if (b.dataset.act === 'toggle') d.on = !d.on;
      if (b.dataset.act === 'up') d.target = Math.min(85, d.target + 1);
      if (b.dataset.act === 'down') d.target = Math.max(55, d.target - 1);
    });
  });

  $('devices').addEventListener('change', e => {
    const r = e.target.closest('input[data-act]');
    if (!r) return;
    const id = r.closest('.device').dataset.id;
    update(id, d => { d[r.dataset.act] = Number(r.value); });
  });

  const SCENES = {
    morning: d => { if (d.type === 'light') { d.on = d.room !== 'Bedroom' || d.id === 'br-lamp'; d.brightness = 90; }
                    if (d.id === 'kt-coffee') d.on = true; if (d.type === 'blinds') d.position = 100; },
    focus:   d => { if (d.type === 'light') d.on = d.room === 'Office'; if (d.id === 'of-desk') d.brightness = 100;
                    if (d.id === 'lr-tv') d.on = false; },
    movie:   d => { if (d.type === 'light') { d.on = d.id === 'lr-lamp'; d.brightness = 20; } if (d.id === 'lr-tv') d.on = true; },
    away:    d => { if (d.type === 'light' || d.type === 'plug') d.on = false; if (d.type === 'lock') d.on = true; if (d.type === 'camera') d.on = true; },
    night:   d => { if (d.type === 'light' || d.type === 'plug') d.on = false; if (d.type === 'lock') d.on = true;
                    if (d.type === 'blinds') d.position = 0; if (d.type === 'thermostat') d.target = 66; },
  };

  $('scenes').addEventListener('click', e => {
    const b = e.target.closest('[data-scene]');
    if (!b) return;
    devices.forEach(SCENES[b.dataset.scene]);
    DeskDevices.save(devices);
    document.querySelectorAll('.scene').forEach(x => x.classList.toggle('active', x === b));
    render();
  });

  render();

  // ---------- Tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $('panel-devices').hidden = name !== 'devices';
    $('panel-servers').hidden = name !== 'servers';
    $('draft-badge').hidden = name !== 'devices';
    history.replaceState(null, '', name === 'servers' ? '#servers' : '#');
  }
  $('tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) showTab(t.dataset.tab);
  });

  // ---------- Servers ----------
  const STATUS = { up: 'Running', warn: 'Slow', down: 'Not responding', checking: 'Checking…' };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const host = url => { try { return new URL(url).host; } catch (e) { return url; } };
  let servers = DeskServers.list().map(s => ({ ...s, status: 'checking' }));

  const row = (label, value) => `<div class="info-row"><span>${label}</span><span>${value}</span></div>`;

  function renderServers() {
    const order = { up: 0, warn: 1, checking: 2, down: 3 };
    const list = [...servers].sort((a, b) => order[a.status] - order[b.status]);
    $('servers').innerHTML = list.length ? list.map(s => {
      const live = s.status === 'up' || s.status === 'warn';
      const rows = [
        live ? row('Response', `${s.ms} ms`) : '',
        s.version ? row('Version', esc(s.version)) : '',
        s.serverName ? row('Server name', esc(s.serverName)) : '',
        live && s.tailscaleUrl ? row('Reached via', s.via) : '',
        s.tailscaleUrl ? row('Tailscale', `<code>${esc(host(s.tailscaleUrl))}</code>`) : '',
      ].join('');
      const openUrl = s.url && live ? (s.via === 'Tailscale' ? s.tailscaleUrl : s.url) : s.url;
      return `<article class="server card ${s.status}">
        <div class="server-top">
          <div class="server-icon">${icon(s.icon || 'server')}</div>
          <div class="grow">
            <div class="server-name">${esc(s.name)}</div>
            <div class="server-desc">${esc(s.desc || '')}</div>
          </div>
          <span class="status ${s.status}">${STATUS[s.status]}</span>
        </div>
        ${rows ? `<div class="info">${rows}</div>` : ''}
        <div class="server-foot">
          <code>${esc(host(s.url))}</code>
          <a class="open-btn" href="${esc(openUrl)}" target="_blank" rel="noopener">Open ${icon('external', 14)}</a>
        </div>
      </article>`;
    }).join('') : '<p class="muted">No servers yet. Add them in <code>assets/config.js</code>.</p>';

    const done = servers.filter(s => s.status !== 'checking');
    const sum = DeskServers.summary(done);
    const live = done.filter(s => s.ms != null && s.status !== 'down');
    $('srv-count').textContent = `${sum.up}/${servers.length}`;
    $('srv-up').textContent = sum.up;
    $('srv-down').textContent = done.length - sum.up;
    $('srv-down').classList.toggle('bad', done.length - sum.up > 0);
    $('srv-ms').textContent = live.length ? Math.round(live.reduce((a, s) => a + s.ms, 0) / live.length) + ' ms' : '–';
  }

  async function checkServers() {
    $('srv-refresh').disabled = true;
    $('srv-refresh').textContent = 'Checking…';
    servers = await DeskServers.checkAll();
    $('srv-checked').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    $('srv-refresh').disabled = false;
    $('srv-refresh').textContent = 'Check now';
    renderServers();
  }

  $('srv-refresh').onclick = checkServers;
  renderServers();
  checkServers();
  setInterval(checkServers, 30000);

  if (location.hash === '#servers') showTab('servers');
})();
