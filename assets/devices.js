// Smart light state. Saved in this browser until the real light is connected.
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

  window.DeskLight = {
    COLORS, SCENES,
    config() { return window.DESKBUDDY_CONFIG.light || { name: 'Smart Light' }; },
    load() {
      try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)) }; }
      catch (e) { return { ...DEFAULT }; }
    },
    save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} },
    stateText(s) { return s.on ? `On · ${s.brightness}%` : 'Off'; },
  };
})();
