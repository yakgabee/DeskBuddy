// Weather from OpenWeatherMap, fetched by server.py (the API key stays there).
window.DeskWeather = {
  ICONS: {
    '01d': 'sun', '01n': 'moon', '02d': 'cloudSun', '02n': 'cloudMoon',
    '03': 'cloud', '04': 'cloud', '09': 'rain', '10': 'rain', '11': 'storm', '13': 'snow', '50': 'fog',
  },
  icon(code) { return this.ICONS[code] || this.ICONS[(code || '').slice(0, 2)] || 'cloud'; },
  async get() {
    try {
      const r = await fetch('/api/weather', { cache: 'no-store' });
      if (r.status === 404) return { error: 'no_server' };
      return await r.json();
    } catch (e) {
      return { error: 'no_server' };
    }
  },
};
