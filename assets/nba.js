// NBA tab: today's games (live, final, upcoming) and yesterday's results, via server.py.
(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const favorite = String((window.DESKBUDDY_CONFIG?.nba || {}).favorite || '').toUpperCase();
  let days = null;
  let error = null;
  let timer = null;
  let updated = null;
  const prevScores = {};   // game id -> "away-home", to flash scores that just changed

  const tipoff = s => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });   // e.g. 7:30 PM
  const hasFav = g => favorite && (g.home?.abbr === favorite || g.away?.abbr === favorite);

  // One label per game, for watching in Canada: TSN or Sportsnet when the feed lists
  // either (whichever it lists first), otherwise NBA League Pass (NBA+).
  function channel(g) {
    for (const n of g.tv || []) {
      if (/^TSN/i.test(n)) return ['TSN', 'tsn'];
      if (/^(SN|Sportsnet)/i.test(n)) return ['SN', 'sn'];
    }
    return ['NBA+', 'nbalp'];
  }
  const tvLabels = g => { const [label, cls] = channel(g); return `<span class="nba-tv ${cls}">${label}</span>`; };

  function team(t, g, changed) {
    if (!t) return '';
    const lost = g.state === 'post' && !t.winner;
    return `<div class="nba-team ${t.winner ? 'won' : ''} ${lost ? 'lost' : ''}">
      <span class="nba-logo">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(t.abbr)}'.slice(0,3)))">` : esc(t.abbr)}</span>
      <span class="nba-name">${esc(t.name || t.abbr)}<small>${esc(t.record || '')}</small></span>
      <span class="nba-score ${changed ? 'bump' : ''}">${g.state === 'pre' ? '' : esc(t.score ?? '')}</span>
    </div>`;
  }

  function game(g) {
    const status = g.state === 'in' ? `<span class="live-dot"></span>${esc(g.detail)}`
      : g.state === 'pre' ? esc(tipoff(g.start)) : esc(g.detail || 'Final');
    const key = `${g.away?.score ?? ''}-${g.home?.score ?? ''}`;
    const before = prevScores[g.id];
    prevScores[g.id] = key;
    const changed = before !== undefined && before !== key;
    const [a0, h0] = (before || '').split('-');
    return `<div class="card nba-game ${g.state} ${hasFav(g) ? 'fav' : ''}">
      <div class="nba-status"><span class="nba-when">${status}</span><span class="nba-tvs">${tvLabels(g)}</span></div>
      ${team(g.away, g, changed && a0 !== String(g.away?.score ?? ''))}${team(g.home, g, changed && h0 !== String(g.home?.score ?? ''))}
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
    const at = updated ? ` · updated ${new Date(updated * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : '';
    $('nba-meta').textContent = (live ? `${live} live now` : today.length ? `${today.length} game${today.length > 1 ? 's' : ''} today` : 'No games today') + at;
  }

  async function load() {
    try {
      const r = await fetch('/api/nba', { cache: 'no-store' });
      if (r.status === 404) { error = 'no_server'; days = null; }
      else {
        const d = await r.json();
        if (d.error) { if (!days) error = d.error; }
        else { error = null; days = d.days || []; updated = d.updated || null; refreshIn = d.refreshIn || 300; }
      }
    } catch (e) {
      if (!days) error = 'no_server';
    }
    render();
    // The server says when there'll be news: every 15 s during games, at tip-off, else 5 min.
    clearTimeout(timer);
    timer = setTimeout(load, (Math.max(10, refreshIn) + 1) * 1000);
  }
  let refreshIn = 300;

  // Opening the tab, or the Pi waking up, shows the latest scores right away.
  window.addEventListener('deskbuddy:tab', e => { if (e.detail === 'nba') load(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

  render();
  load();
})();
