// Shared clock helpers
window.DeskClock = {
  start(opts) {
    const tick = () => {
      const now = new Date();
      let h = now.getHours();
      const m = String(now.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      if (opts.time) opts.time.innerHTML = `${h}:${m}<span class="ampm">${ampm}</span>`;
      if (opts.short) opts.short.textContent = `${h}:${m} ${ampm}`;
      if (opts.date) opts.date.textContent = now.toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
      if (opts.greeting) {
        const hr = now.getHours();
        opts.greeting.textContent = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
      }
    };
    tick();
    setInterval(tick, 1000);
  }
};
