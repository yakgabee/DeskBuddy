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
    history.replaceState(null, '', name === 'servers' ? '#servers' : '#');
  }
  $('tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) showTab(t.dataset.tab);
  });

  // ---------- Servers ----------
  const servers = DeskServers.load();
  const STATUS = { up: 'Running', warn: 'Slow', down: 'Stopped' };
  const uptime = h => h === 0 ? '—' : h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`;
  const meter = (label, v) => `<div>
      <div class="meter-label"><span>${label}</span><span>${v}%</span></div>
      <div class="meter"><div class="${v >= 70 ? 'hot' : ''}" style="width:${v}%"></div></div>
    </div>`;

  function renderServers() {
    // Running first, then slow, then stopped
    const order = { up: 0, warn: 1, down: 2 };
    const list = [...servers].sort((a, b) => order[a.status] - order[b.status]);
    $('servers').innerHTML = list.map(s => `
      <article class="server card ${s.status}">
        <div class="server-top">
          <div class="server-icon">${icon(s.icon)}</div>
          <div class="grow">
            <div class="server-name">${s.name}</div>
            <div class="server-desc">${s.desc}</div>
          </div>
          <span class="status ${s.status}">${STATUS[s.status]}</span>
        </div>
        <div class="meters">${meter('CPU', s.cpu)}${meter('Memory', s.ram)}</div>
        <div class="server-foot">
          <div class="foot-info">
            <code>${s.host}:${s.port}</code>
            <span>${s.status === 'down' ? 'Offline' : 'Up ' + uptime(s.uptimeH)}${s.ping ? ` · ${s.ping} ms` : ''}</span>
          </div>
          ${s.status !== 'down' ? `<a class="open-btn" href="http://${s.host}:${s.port}" target="_blank" rel="noopener">Open ${icon('external', 14)}</a>` : ''}
        </div>
      </article>`).join('');

    const sum = DeskServers.summary(servers);
    const running = servers.filter(s => s.status !== 'down');
    $('srv-count').textContent = `${sum.up}/${sum.total}`;
    $('srv-up').textContent = sum.up;
    $('srv-down').textContent = sum.total - sum.up;
    $('srv-down').classList.toggle('bad', sum.total - sum.up > 0);
    $('srv-cpu').textContent = running.length ? Math.round(running.reduce((a, s) => a + s.cpu, 0) / running.length) + '%' : '–';
    $('srv-checked').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  }

  renderServers();
  setInterval(() => { DeskServers.jitter(servers); renderServers(); }, 5000);

  if (location.hash === '#servers') showTab('servers');
})();
