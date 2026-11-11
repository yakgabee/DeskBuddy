// Calendar tab: upcoming events from iCloud (or calendar links), via server.py.
(() => {
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ERRORS = {
    not_set_up: 'Connect your iCloud calendar: run <code>./setup-pi.sh</code>. It asks for your Apple ID and an app-specific password.',
    not_installed: 'Calendar support isn\'t installed yet. Run <code>./setup-pi.sh</code>.',
    auth: 'iCloud didn\'t accept the login. Check your Apple ID and app-specific password with <code>./setup-pi.sh</code>.',
    unreachable: 'Can\'t reach your calendar right now. Trying again soon.',
    no_server: 'Start DeskBuddy with <code>kiosk.sh</code> to see your calendar.',
  };
  let events = [];
  let error = null;

  const at = s => new Date(s);                       // "2026-11-12T09:00" = local time
  const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const time = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  function dayName(d) {
    const today = new Date(), tomorrow = new Date(Date.now() + 864e5);
    const date = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    if (dayKey(d) === dayKey(today)) return `<b>Today</b> · ${date}`;
    if (dayKey(d) === dayKey(tomorrow)) return `<b>Tomorrow</b> · ${date}`;
    return `<b>${d.toLocaleDateString([], { weekday: 'long' })}</b> · ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }

  function render() {
    const now = new Date();
    if (error) {
      $('agenda').innerHTML = `<p class="ts-empty card">${ERRORS[error] || ERRORS.unreachable}</p>`;
      $('cal-meta').textContent = '';
      $('tab-calendar').textContent = '';
      announce(null);
      return;
    }
    const upcoming = events.filter(e => e.allDay ? at(e.end) > now || dayKey(at(e.start)) === dayKey(now) : at(e.end) > now);
    const days = [];
    upcoming.forEach(e => {
      const k = dayKey(at(e.start));
      let day = days.find(x => x.key === k);
      if (!day) days.push(day = { key: k, date: at(e.start), items: [] });
      day.items.push(e);
    });
    $('agenda').innerHTML = days.length ? days.map(day => `
      <div>
        <div class="day-head">${dayName(day.date)}</div>
        <div class="card day-card">${day.items.map(e => {
          const s = at(e.start), en = at(e.end), live = !e.allDay && s <= now && en > now;
          return `<div class="ev ${live ? 'now' : ''}" style="--ev-color:${esc(e.color || '#ffffff')}">
            <div class="ev-time">${e.allDay ? '<b>All day</b>' : `<b>${live ? 'Now' : time(s)}</b>${time(en)}`}</div>
            <div class="ev-bar"></div>
            <div style="min-width:0">
              <div class="ev-title">${esc(e.title)}</div>
              <div class="ev-sub">${esc([e.location, e.calendar].filter(Boolean).join(' · '))}</div>
            </div>
          </div>`;
        }).join('')}</div>
      </div>`).join('') : '<p class="ts-empty card">Nothing coming up in the next two weeks.</p>';
    const todayLeft = upcoming.filter(e => dayKey(at(e.start)) === dayKey(now)).length;
    $('tab-calendar').textContent = todayLeft || '';
    $('cal-meta').textContent = todayLeft ? `${todayLeft} today` : 'Nothing else today';
    // Next thing for the home screen: what's on now, or the next timed event today/tomorrow.
    const next = upcoming.find(e => !e.allDay && at(e.end) > now && at(e.start) - now < 36 * 3600e3)
      || upcoming.find(e => e.allDay && dayKey(at(e.start)) === dayKey(now));
    announce(next ? {
      title: next.title,
      when: next.allDay ? 'Today' : at(next.start) <= now ? 'Now'
        : dayKey(at(next.start)) === dayKey(now) ? time(at(next.start)) : `Tomorrow ${time(at(next.start))}`,
    } : null);
  }

  let announced = '';
  function announce(info) {
    const key = JSON.stringify(info);
    if (key === announced) return;
    announced = key;
    window.dispatchEvent(new CustomEvent('deskbuddy:nextevent', { detail: info }));
  }

  async function load(force) {
    try {
      const r = await fetch('/api/calendar' + (force ? '?refresh=1' : ''), { cache: 'no-store' });
      if (r.status === 404) { error = 'no_server'; return render(); }
      const d = await r.json();
      if (d.error) {
        // Keep showing the events we have if it's just a connection blip.
        if (!(d.error === 'unreachable' && events.length)) { error = d.error; events = []; }
      } else {
        error = null;
        events = d.events || [];
      }
    } catch (e) {
      if (!events.length) error = 'no_server';
    }
    render();
  }

  $('cal-refresh').onclick = async () => {
    $('cal-refresh').disabled = true;
    $('cal-refresh').textContent = 'Refreshing…';
    await load(true);
    $('cal-refresh').textContent = 'Updated ✓';
    setTimeout(() => { $('cal-refresh').disabled = false; $('cal-refresh').textContent = 'Refresh'; }, 1500);
  };
  load();
  setInterval(load, 5 * 60 * 1000);
  setInterval(render, 60 * 1000); // keep "Now" and the next event current
})();
