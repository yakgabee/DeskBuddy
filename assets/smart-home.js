(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  DeskClock.start({ short: $('sh-clock') });

  const summary = { devices: '', servers: '', downloads: '', tailscale: '' };
  const renderSummary = () => {
    $('sh-summary').textContent = [summary.devices, summary.servers, summary.downloads, summary.tailscale].filter(Boolean).join(' · ');
  };

  // ---------- Tabs ----------
  const TABS = ['devices', 'servers', 'downloads', 'tailscale'];
  function showTab(name) {
    if (!TABS.includes(name)) name = 'devices';
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
      t.setAttribute('aria-selected', t.dataset.tab === name);
    });
    TABS.forEach(t => { $(`panel-${t}`).hidden = t !== name; });
    history.replaceState(null, '', `#${name}`);
  }
  $('tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) showTab(t.dataset.tab);
  });
  showTab(location.hash.slice(1));

  // ---------- Devices (computer, Apple TV, …) ----------
  const DEV_STATUS = {
    online: 'Online', offline: 'Offline', checking: 'Checking…',
    unset: 'Not set up', invalid: 'Check the address', no_server: 'Start with start.sh / kiosk.sh',
  };
  let devices = DeskDevices.list().map(d => ({ ...d, status: d.host ? 'checking' : 'unset' }));
  let wakeIds = [];
  const waking = {};   // id -> time the wake signal was sent
  const WAKE_WINDOW = 3 * 60 * 1000;

  function renderDevices() {
    $('devices').innerHTML = devices.length ? devices.map(d => {
      const isWaking = d.status !== 'online' && waking[d.id] && Date.now() - waking[d.id] < WAKE_WINDOW;
      const statusClass = d.status === 'online' ? 'up' : isWaking ? 'checking' : d.status === 'offline' ? 'down' : 'checking';
      const canWake = wakeIds.includes(d.id) && d.status !== 'online';
      return `<article class="dev card ${d.status}">
        <div class="dev-top">
          <div class="dev-icon">${icon(d.icon || 'server', 28)}</div>
          ${canWake ? `<button class="open-btn wake-btn" data-wake="${esc(d.id)}" ${isWaking ? 'disabled' : ''}>${icon('power', 14)}${isWaking ? 'Waking…' : 'Wake'}</button>` : ''}
        </div>
        <div class="dev-name">${esc(d.name)}</div>
        <span class="status ${statusClass}">${isWaking ? 'Waking up…' : DEV_STATUS[d.status] || d.status}</span>
        <div class="dev-sub">${d.host
          ? `<code>${esc(d.host)}</code>${d.status === 'online' && d.ms != null ? ` · ${d.ms} ms` : ''}`
          : 'Add its IP address in <code>assets/config.js</code>'}</div>
      </article>`;
    }).join('') : '<p class="ts-empty">No devices yet. Add them in <code>assets/config.js</code>.</p>';
    const sum = DeskDevices.summary(devices);
    const done = devices.every(d => d.status !== 'checking');
    if (done) {
      $('dev-meta').textContent = sum.total ? `${sum.online} of ${sum.total} online` : 'No devices set up';
      $('tab-devices').textContent = sum.total ? `${sum.online}/${sum.total}` : '';
      summary.devices = sum.total ? `${sum.online}/${sum.total} devices online` : '';
      renderSummary();
    }
  }

  async function checkDevices() {
    devices = await DeskDevices.checkAll();
    devices.forEach(d => { if (d.status === 'online') delete waking[d.id]; });
    renderDevices();
  }

  $('devices').addEventListener('click', async e => {
    const b = e.target.closest('[data-wake]');
    if (!b) return;
    const d = devices.find(x => x.id === b.dataset.wake);
    if (!d) return;
    waking[d.id] = Date.now();
    renderDevices();
    if (!(await DeskDevices.wake(d))) {
      delete waking[d.id];
      $('dev-meta').textContent = `Couldn't send the wake signal to ${d.name}`;
      return renderDevices();
    }
    // Check every few seconds while it boots.
    const started = Date.now();
    const timer = setInterval(async () => {
      await checkDevices();
      if (!waking[d.id] || Date.now() - started > WAKE_WINDOW) { clearInterval(timer); renderDevices(); }
    }, 4000);
  });

  renderDevices();
  DeskDevices.wakeable().then(ids => { wakeIds = ids; renderDevices(); });
  checkDevices();
  setInterval(checkDevices, 15000);

  // ---------- Servers ----------
  const STATUS = { up: 'Running', warn: 'Slow', down: 'Not responding', checking: 'Checking…' };
  const host = url => { try { return new URL(url).host; } catch (e) { return url; } };
  const row = (label, value) => `<div class="info-row"><span>${label}</span><span>${value}</span></div>`;
  const gb = n => n >= 1e12 ? `${(n / 1e12).toFixed(1)} TB` : `${Math.round(n / 1e9)} GB`;
  const usage = (label, u, hotAt) => `<div class="usage">
      <div class="meter-label"><span>${esc(label)}</span><span>${Math.round(u.percent)}% <em>· ${gb(u.used)} of ${gb(u.total)}</em></span></div>
      <div class="meter"><div class="${u.percent >= hotAt ? 'hot' : ''}" style="width:${u.percent}%"></div></div>
    </div>`;
  const diskLabel = d => d.mount === '/' ? 'Storage' : `Storage ${d.mount}`;
  let servers = DeskServers.list().map(s => ({ ...s, status: 'checking' }));

  function renderServers() {
    const order = { up: 0, warn: 1, checking: 2, down: 3 };
    const list = [...servers].sort((a, b) => order[a.status] - order[b.status]);
    $('servers').innerHTML = list.length ? list.map(s => {
      const live = s.status === 'up' || s.status === 'warn';
      if (s.type === 'agent') {
        const st = live && s.stats;
        const body = st
          ? [st.ram ? usage('RAM', st.ram, 85) : '', ...st.disks.map(d => usage(diskLabel(d), d, 90))].join('')
          : s.status === 'down' ? '<p class="server-hint">Not answering. Is <code>deskbuddy-agent.py</code> running on it?</p>' : '';
        return `<article class="server card ${s.status}">
          <div class="server-top">
            <div class="server-icon">${icon(s.icon || 'server')}</div>
            <div class="grow">
              <div class="server-name">${esc(s.name)}</div>
              <div class="server-desc">${esc(st ? st.hostname : s.desc)}</div>
            </div>
            <span class="status ${s.status}">${STATUS[s.status]}</span>
          </div>
          ${body ? `<div class="usages">${body}</div>` : ''}
          <div class="server-foot">
            <code>${esc(host(s.url).replace(/:9091$/, ''))}</code>
            ${live ? `<span>${s.ms} ms</span>` : ''}
          </div>
        </article>`;
      }
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
    $('srv-up').textContent = sum.up;
    $('srv-down').textContent = done.length - sum.up;
    $('srv-down').classList.toggle('bad', done.length - sum.up > 0);
    $('srv-ms').textContent = live.length ? Math.round(live.reduce((a, s) => a + s.ms, 0) / live.length) + ' ms' : '–';
    if (done.length) {
      summary.servers = `${sum.up}/${servers.length} servers up`;
      $('tab-servers').textContent = `${sum.up}/${servers.length}`;
    }
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
      $('tab-tailscale').textContent = '';
      summary.tailscale = '';
      return renderSummary();
    }
    const s = DeskTailscale.summary(d);
    const exit = d.peers.find(p => p.exitNode);
    $('ts-meta').textContent = [`${s.online} of ${s.total} online`, d.tailnet, exit ? `Exit node: ${exit.name}` : ''].filter(Boolean).join(' · ');
    $('tailscale').innerHTML = [d.self, ...d.peers].map(tsRow).join('');
    summary.tailscale = `${s.online}/${s.total} on Tailscale`;
    $('tab-tailscale').textContent = `${s.online}/${s.total}`;
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

  // ---------- Downloads (uTorrent) ----------
  const T = DeskTorrents;
  async function checkTorrents() {
    const d = await T.status();
    if (!d.connected) {
      $('torrents').innerHTML = `<p class="ts-empty">${T.ERRORS[d.error] || T.ERRORS.unreachable}</p>`;
      $('tor-meta').textContent = '';
      $('tab-downloads').textContent = '';
      summary.downloads = '';
      return renderSummary();
    }
    const active = T.active(d);
    $('tor-meta').textContent = [
      active.length ? `${active.length} downloading` : 'Nothing downloading',
      `↓ ${T.speed(d.downSpeed)}`, `↑ ${T.speed(d.upSpeed)}`,
    ].join(' · ');
    $('torrents').innerHTML = d.torrents.length ? d.torrents.map(t => {
      const moving = t.state === 'downloading';
      return `<div class="tor-row ${t.state}">
        <div style="min-width:0">
          <div class="tor-name" title="${esc(t.name)}">${esc(t.name)}</div>
          <div class="tor-sub">${T.bytes(t.size)}${t.label ? ` · ${esc(t.label)}` : ''}</div>
        </div>
        <div class="tor-prog">
          <div class="meter-label"><span>${T.bytes(t.size - t.remaining)}</span><span>${Math.floor(t.progress)}%</span></div>
          <div class="meter"><div style="width:${t.progress}%"></div></div>
        </div>
        <span class="status ${t.state}">${esc(t.stateText)}</span>
        <span class="tor-speed">${moving ? `↓ ${T.speed(t.downSpeed)}` : t.upSpeed ? `↑ ${T.speed(t.upSpeed)}` : ''}</span>
        <span class="tor-eta">${moving ? T.eta(t.eta) : ''}</span>
      </div>`;
    }).join('') : '<p class="ts-empty">No torrents in uTorrent.</p>';
    summary.downloads = active.length ? `${active.length} downloading` : '';
    $('tab-downloads').textContent = active.length || '';
    renderSummary();
  }
  checkTorrents();
  setInterval(checkTorrents, 3000);

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

})();
