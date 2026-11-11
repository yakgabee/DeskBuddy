// NBA tab: today's games (live, final, upcoming) and yesterday's results, via server.py.
(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const favorite = String((window.DESKBUDDY_CONFIG?.nba || {}).favorite || '').toUpperCase();
  let days = null;
  let error = null;
  let timer = null;

  const tipoff = s => new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const hasFav = g => favorite && (g.home?.abbr === favorite || g.away?.abbr === favorite);

  function team(t, g) {
    if (!t) return '';
    const lost = g.state === 'post' && !t.winner;
    return `<div class="nba-team ${t.winner ? 'won' : ''} ${lost ? 'lost' : ''}">
      <span class="nba-logo">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(t.abbr)}'.slice(0,3)))">` : esc(t.abbr)}</span>
      <span class="nba-name">${esc(t.name || t.abbr)}<small>${esc(t.record || '')}</small></span>
      <span class="nba-score">${g.state === 'pre' ? '' : esc(t.score ?? '')}</span>
    </div>`;
  }

  function game(g) {
    const status = g.state === 'in' ? `<span class="live-dot"></span>${esc(g.detail)}`
      : g.state === 'pre' ? esc(tipoff(g.start)) : esc(g.detail || 'Final');
    return `<div class="card nba-game ${g.state} ${hasFav(g) ? 'fav' : ''}">
      <div class="nba-status">${status}</div>
      ${team(g.away, g)}${team(g.home, g)}
    </div>`;
  }

  function render() {
    if (error || !days) {
      $('nba').innerHTML = `<p class="ts-empty card">${error === 'no_server'
        ? 'Start DeskBuddy with <code>kiosk.sh</code> to see NBA scores.'
        : error ? 'Can\'t reach the NBA scores right now. Trying again soon.' : 'Loading scores…'}</p>`;
      $('nba-meta').textContent = '';
      $('tab-nba').textContent = '';
      return;
    }
    const order = { in: 0, pre: 1, post: 2 };
    $('nba').innerHTML = days.map(d => {
      const games = [...d.games].sort((a, b) => (hasFav(b) - hasFav(a)) || (order[a.state] - order[b.state]) || (new Date(a.start) - new Date(b.start)));
      const date = new Date(d.date + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      return `<div>
        <div class="day-head"><b>${esc(d.label)}</b> · ${esc(date)}</div>
        ${games.length ? `<div class="nba-grid">${games.map(game).join('')}</div>` : '<p class="ts-empty card">No games.</p>'}
      </div>`;
    }).join('');
    const today = days[0]?.games || [];
    const live = today.filter(g => g.state === 'in').length;
    $('tab-nba').textContent = live || '';
    $('nba-meta').textContent = live ? `${live} live now` : today.length ? `${today.length} game${today.length > 1 ? 's' : ''} today` : 'No games today';
  }

  async function load() {
    try {
      const r = await fetch('/api/nba', { cache: 'no-store' });
      if (r.status === 404) { error = 'no_server'; days = null; }
      else {
        const d = await r.json();
        if (d.error) { if (!days) error = d.error; }
        else { error = null; days = d.days || []; }
      }
    } catch (e) {
      if (!days) error = 'no_server';
    }
    render();
    // Every 30 s while a game is on, every 5 min otherwise.
    const live = (days || []).some(d => d.games.some(g => g.state === 'in'));
    clearTimeout(timer);
    timer = setTimeout(load, live ? 30e3 : 300e3);
  }

  render();
  load();
})();
