// Smart light: talks to server.py (/api/light), which controls the Smart Life
// (Tuya) bulb over your Wi-Fi. Falls back to a saved preview state when the
// light isn't set up yet.
(() => {
  const KEY = 'deskbuddy.light';

  const COLORS = {
    warm:     { label: 'Warm',      hex: '#ffad5c' },
    soft:     { label: 'Soft',      hex: '#ffd29a' },
    daylight: { label: 'Daylight',  hex: '#fff3e0' },
    cool:     { label: 'Cool',      hex: '#d6e6ff' },
    red:      { label: 'Red',       hex: '#ff5a5a' },
    orange:   { label: 'Orange',    hex: '#ff8c42' },
    green:    { label: 'Green',     hex: '#3ccf7f' },
    blue:     { label: 'Blue',      hex: '#4d8dff' },
    purple:   { label: 'Purple',    hex: '#9b6bff' },
    pink:     { label: 'Pink',      hex: '#ff6bb5' },
  };

  const SCENES = {
    bright:  { label: 'Bright',      icon: 'sun',        on: true,  brightness: 100, color: 'daylight' },
    relax:   { label: 'Relax',       icon: 'headphones', on: true,  brightness: 45,  color: 'warm' },
    reading: { label: 'Reading',     icon: 'lamp',       on: true,  brightness: 80,  color: 'soft' },
    movie:   { label: 'Movie',       icon: 'film',       on: true,  brightness: 15,  color: 'purple' },
    night:   { label: 'Night light', icon: 'moon',       on: true,  brightness: 5,   color: 'warm' },
  };

  const DEFAULT = { on: true, brightness: 70, color: 'warm', scene: null };

  const PROBLEMS = {
    no_server: 'Start DeskBuddy with <code>start.sh</code> or <code>start.bat</code> to control your light.',
    no_tinytuya: 'One step left: install the light helper by running <code>pip install tinytuya</code>, then restart DeskBuddy.',
    not_set_up: 'Your light isn\'t connected yet. Follow “Connect your Evolux light” in the README (about 10 minutes, once).',
    not_found: 'DeskBuddy couldn\'t find your light on the Wi-Fi. Make sure it\'s powered on, then run <code>python -m tinytuya scan</code> in the DeskBuddy folder.',
    unreachable: 'Your light isn\'t answering. Check it\'s powered on and connected to Wi-Fi.',
  };

  async function call(method, body) {
    try {
      const r = await fetch('/api/light', {
        method,
        cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 404 || r.status === 501) return { connected: false, error: 'no_server' };
      return await r.json();
    } catch (e) {
      return { connected: false, error: 'no_server' };
    }
  }

  window.DeskLight = {
    COLORS, SCENES, PROBLEMS,
    config() { return window.DESKBUDDY_CONFIG.light || { name: 'Smart Light' }; },
    load() {
      try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)) }; }
      catch (e) { return { ...DEFAULT }; }
    },
    save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} },
    stateText(s) { return s.on ? `On · ${s.brightness}%` : 'Off'; },
    // Real light. Both resolve to { connected, on, brightness, name } or { connected: false, error }.
    fetch() { return call('GET'); },
    send(changes) { return call('POST', changes); },
  };
})();
