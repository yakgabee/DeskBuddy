// App-style logos for the tabs (simple drawings in each app's colours).
(() => {
  const tile = (bg, inner) => `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="${bg}"/>${inner}</svg>`;
  const stroke = 'fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  const LOGOS = {
    spotify: () => `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ED760"/>
      <path d="M6.3 9.2c3.9-1.2 8.3-.8 11.6 1.1M7 12.4c3.3-1 6.9-.6 9.7 1M7.8 15.4c2.7-.7 5.4-.5 7.6.8" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    devices: () => tile('#0A84FF', `<path d="M5.5 11 12 5.5l6.5 5.5v7a1 1 0 0 1-1 1h-3.5v-4.5h-4V19H6.5a1 1 0 0 1-1-1z" ${stroke}/>`),
    servers: () => tile('#5E5CE6', `<rect x="5.5" y="5.5" width="13" height="5" rx="1.3" ${stroke}/><rect x="5.5" y="13.5" width="13" height="5" rx="1.3" ${stroke}/><path d="M8.5 8h.01M8.5 16h.01" ${stroke}/>`),
    downloads: () => tile('#76B83F', `<text x="12" y="17.3" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#fff">µ</text>`),
    tailscale: () => {
      const dot = (x, y, on) => `<circle cx="${x}" cy="${y}" r="2.1" fill="#fff" opacity="${on ? 1 : 0.3}"/>`;
      return tile('#242424', [dot(6.5, 6.5), dot(12, 6.5), dot(17.5, 6.5), dot(6.5, 12, 1), dot(12, 12, 1), dot(17.5, 12, 1), dot(6.5, 17.5), dot(12, 17.5, 1), dot(17.5, 17.5)].join(''));
    },
    calendar: () => {
      const now = new Date();
      return `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#fff"/>
        <path d="M0 6a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v1.5H0z" fill="#FF3B30"/>
        <text x="12" y="5.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="4.6" font-weight="700" fill="#fff">${now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</text>
        <text x="12" y="19.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11.5" font-weight="400" fill="#111">${now.getDate()}</text></svg>`;
    },
  };
  window.logo = name => (LOGOS[name] ? LOGOS[name]() : '');
  const fill = () => document.querySelectorAll('[data-logo]').forEach(el => { el.innerHTML = logo(el.dataset.logo); });
  fill();
  setInterval(fill, 10 * 60 * 1000); // keeps the calendar's date current
})();
