(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  DeskClock.start({ short: $('sh-clock') });

  const summary = { light: '', servers: '', tailscale: '' };
  const renderSummary = () => {
    $('sh-summary').textContent = [summary.light, summary.servers, summary.tailscale].filter(Boolean).join(' · ');
  };

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

  // ---------- Smart light ----------
  const lightCfg = DeskLight.config();
  let light = DeskLight.load();
  let lightLive = false;      // true once the real bulb answers
  let pending = 0;            // requests in flight (skip polling meanwhile)
  $('light-name').textContent = lightCfg.name;

  $('swatches').innerHTML = Object.entries(DeskLight.COLORS).map(([key, c]) =>
    `<button class="swatch" data-color="${key}" style="--sw:${c.hex}" aria-label="${c.label}" title="${c.label}"></button>`).join('');
  $('scenes').innerHTML = Object.entries(DeskLight.SCENES).map(([key, sc]) =>
    `<button class="scene" data-scene="${key}"><span>${icon(sc.icon, 16)}</span>${sc.label}</button>`).join('')
    + `<button class="scene" data-scene="off"><span>${icon('power', 16)}</span>All off</button>`;

  function renderLight() {
    const c = DeskLight.COLORS[light.color] || DeskLight.COLORS.warm;
    const el = $('light');
    el.classList.toggle('on', light.on);
    el.style.setProperty('--light', c.hex);
    $('light-state').textContent = DeskLight.stateText(light) + (light.on ? ` · ${c.label}` : '');
    $('light-toggle').classList.toggle('on', light.on);
    $('light-bright').value = light.brightness;
    $('light-bright').disabled = !light.on;
    $('light-bright').style.setProperty('--fill', `${light.brightness}%`);
    $('light-bright-val').textContent = `${light.brightness}%`;
    $('light-color-name').textContent = c.label;
    document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.color === light.color));
    document.querySelectorAll('.scene').forEach(s => s.classList.toggle('active', s.dataset.scene === light.scene));
    summary.light = `Light ${light.on ? `on · ${light.brightness}%` : 'off'}`;
    renderSummary();
  }

  // Apply what the real bulb reports.
  function applyRemote(r) {
    lightLive = !!r.connected;
    $('light-notice').hidden = lightLive;
    if (!lightLive) {
      $('light-problem').innerHTML = DeskLight.PROBLEMS[r.error] || DeskLight.PROBLEMS.unreachable;
      return;
    }
    light = { ...light, on: r.on, brightness: r.brightness ?? light.brightness };
    DeskLight.save(light);
    renderLight();
  }

  async function sendLight(changes) {
    if (!lightLive) return;
    pending++;
    const r = await DeskLight.send(changes);
    pending--;
    if (!pending) applyRemote(r);
  }

  let brightTimer;
  function setLight(changes, scene = null, { send = true, debounce = false } = {}) {
    light = { ...light, ...changes, scene };
    DeskLight.save(light);
    renderLight();
    if (!send) return;
    // The bulb needs the colour with brightness so whites keep their tone.
    const payload = { ...changes };
    if ('brightness' in payload && !('color' in payload)) payload.color = light.color;
    clearTimeout(brightTimer);
    if (debounce) brightTimer = setTimeout(() => sendLight(payload), 250);
    else sendLight(payload);
  }

  $('light-toggle').onclick = () => setLight({ on: !light.on });
  $('light-bright').oninput = e => setLight({ brightness: Number(e.target.value) }, null, { debounce: true });
  $('swatches').onclick = e => {
    const b = e.target.closest('[data-color]');
    if (b) setLight({ color: b.dataset.color, on: true, brightness: light.brightness });
  };
  $('scenes').onclick = e => {
    const b = e.target.closest('[data-scene]');
    if (!b) return;
    const key = b.dataset.scene;
    if (key === 'off') return setLight({ on: false }, 'off');
    const { on, brightness, color } = DeskLight.SCENES[key];
    setLight({ on, brightness, color }, key);
  };
  renderLight();

  // Pick up changes made elsewhere (Alexa, the wall switch…).
  const pollLight = async () => { if (!pending) applyRemote(await DeskLight.fetch()); };
  pollLight();
  setInterval(pollLight, 10000);

  // ---------- Servers ----------
  const STATUS = { up: 'Running', warn: 'Slow', down: 'Not responding', checking: 'Checking…' };
  const host = url => { try { return new URL(url).host; } catch (e) { return url; } };
  const row = (label, value) => `<div class="info-row"><span>${label}</span><span>${value}</span></div>`;
  let servers = DeskServers.list().map(s => ({ ...s, status: 'checking' }));

  function renderServers() {
    const order = { up: 0, warn: 1, checking: 2, down: 3 };
    const list = [...servers].sort((a, b) => order[a.status] - order[b.status]);
    $('servers').innerHTML = list.length ? list.map(s => {
      const live = s.status === 'up' || s.status === 'warn';
      const rows = [
        live ? row('Response', `${s.ms} ms`) : '',
        s.version ? row('Version', esc(s.version)) : '',
        s.serverName ? row('Server name', esc(s.serverName)) : '',
      ].join('');
      return `<article class="server card ${s.status}">
        <div class="server-top">
          <div class="server-icon">${icon(s.icon || 'server')}</div>
          <div class="grow">
            <div class="server-name">${esc(s.name)}</div>
            <div class="server-desc">${esc(s.desc)}</div>
          </div>
          <span class="status ${s.status}">${STATUS[s.status]}</span>
        </div>
        ${rows ? `<div class="info">${rows}</div>` : ''}
        <div class="server-foot">
          <code>${esc(host(s.url))}</code>
          <a class="open-btn" href="${esc(s.url)}" target="_blank" rel="noopener">Open ${icon('external', 14)}</a>
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
    if (done.length) summary.servers = `${sum.up}/${servers.length} servers up`;
    renderSummary();
  }

  // ---------- Tailscale ----------
  const fmtBytes = n => {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1000)));
    return `${(n / 1000 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
  };
  const ago = iso => {
    if (!iso) return 'Offline';
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'Last seen just now';
    if (m < 60) return `Last seen ${m} min ago`;
    if (m < 1440) return `Last seen ${Math.round(m / 60)} h ago`;
    return `Last seen ${Math.round(m / 1440)} d ago`;
  };
  const osIcon = os => {
    const o = (os || '').toLowerCase();
    if (o === 'ios' || o === 'android') return 'phone';
    if (o === 'macos' || o === 'windows') return 'laptop';
    return 'server';
  };
  const TS_ERRORS = {
    no_server: 'Start DeskBuddy with <code>start.sh</code> or <code>start.bat</code> to see your Tailscale devices.',
    not_installed: 'Tailscale isn\'t installed on this computer.',
    not_running: 'Tailscale isn\'t running on this computer. Open the Tailscale app and sign in.',
  };

  function tsRow(n) {
    const ip = n.ips.find(x => x.includes('.')) || n.ips[0] || '';
    const conn = n.self ? 'This device' : !n.online ? '' : n.direct ? 'Direct' : n.relay ? `Relay · ${esc(n.relay)}` : '';
    const tags = [
      n.self ? '<span class="tag">This device</span>' : '',
      n.exitNode ? '<span class="tag accent">Exit node</span>' : '',
    ].join('');
    return `<div class="ts-row ${n.online ? '' : 'offline'}">
      <div class="ts-dev">
        <div class="server-icon">${icon(osIcon(n.os))}</div>
        <div class="grow">
          <div class="server-name">${esc(n.name)} ${tags}</div>
          <div class="server-desc">${esc(n.os)}${n.dnsName ? ` · ${esc(n.dnsName)}` : ''}</div>
        </div>
      </div>
      <button class="ip" data-copy="${esc(ip)}" title="Copy IP"><code>${esc(ip)}</code>${icon('copy', 14)}</button>
      <span class="status ${n.online ? 'up' : 'down'}">${n.online ? 'Online' : ago(n.lastSeen)}</span>
      <span class="ts-conn">${n.self ? '' : conn}</span>
      <span class="ts-traffic">${n.online && !n.self ? `↓ ${fmtBytes(n.rxBytes)} · ↑ ${fmtBytes(n.txBytes)}` : ''}</span>
    </div>`;
  }

  async function checkTailscale() {
    const d = await DeskTailscale.status();
    if (d.error) {
      $('tailscale').innerHTML = `<p class="ts-empty">${TS_ERRORS[d.error] || TS_ERRORS.not_running}</p>`;
      $('ts-meta').textContent = '';
      summary.tailscale = '';
      return renderSummary();
    }
    const s = DeskTailscale.summary(d);
    const exit = d.peers.find(p => p.exitNode);
    $('ts-meta').textContent = [`${s.online} of ${s.total} online`, d.tailnet, exit ? `Exit node: ${exit.name}` : ''].filter(Boolean).join(' · ');
    $('tailscale').innerHTML = [d.self, ...d.peers].map(tsRow).join('');
    summary.tailscale = `${s.online}/${s.total} on Tailscale`;
    renderSummary();
  }

  $('tailscale').addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.classList.add('copied');
      b.querySelector('svg').outerHTML = icon('check', 14);
      setTimeout(() => { b.classList.remove('copied'); b.querySelector('svg').outerHTML = icon('copy', 14); }, 1200);
    } catch (err) { /* clipboard blocked */ }
  });

  // ---------- Refresh ----------
  async function checkAll() {
    $('srv-refresh').disabled = true;
    $('srv-refresh').textContent = 'Checking…';
    const [results] = await Promise.all([DeskServers.checkAll(), checkTailscale()]);
    servers = results;
    $('srv-checked').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    $('srv-refresh').disabled = false;
    $('srv-refresh').textContent = 'Check now';
    renderServers();
  }

  $('srv-refresh').onclick = checkAll;
  renderServers();
  checkAll();
  setInterval(checkAll, 30000);

  if (location.hash === '#servers') showTab('servers');
})();
