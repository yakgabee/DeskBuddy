// Demo smart-home devices. Later this gets replaced with a real integration
// (e.g. Home Assistant, SmartThings, Google Home). State persists in localStorage.
const DEFAULT_DEVICES = [
  { id: 'lr-lamp',   room: 'Living Room', type: 'light',      name: 'Floor Lamp',     icon: '💡', on: true,  brightness: 70 },
  { id: 'lr-ceil',   room: 'Living Room', type: 'light',      name: 'Ceiling Lights', icon: '💡', on: false, brightness: 100 },
  { id: 'lr-tv',     room: 'Living Room', type: 'plug',       name: 'TV',             icon: '📺', on: false },
  { id: 'lr-speak',  room: 'Living Room', type: 'plug',       name: 'Speaker',        icon: '🔊', on: true },
  { id: 'th-main',   room: 'Hallway',     type: 'thermostat', name: 'Thermostat',     icon: '🌡️', on: true,  target: 71, mode: 'Heat' },
  { id: 'door-front',room: 'Hallway',     type: 'lock',       name: 'Front Door',     icon: '🔒', on: true },
  { id: 'cam-door',  room: 'Hallway',     type: 'camera',     name: 'Doorbell Cam',   icon: '📷', on: true },
  { id: 'kt-lights', room: 'Kitchen',     type: 'light',      name: 'Kitchen Lights', icon: '💡', on: true,  brightness: 85 },
  { id: 'kt-coffee', room: 'Kitchen',     type: 'plug',       name: 'Coffee Maker',   icon: '☕', on: false },
  { id: 'br-lamp',   room: 'Bedroom',     type: 'light',      name: 'Bedside Lamp',   icon: '💡', on: false, brightness: 40 },
  { id: 'br-fan',    room: 'Bedroom',     type: 'plug',       name: 'Fan',            icon: '🌀', on: false },
  { id: 'br-blinds', room: 'Bedroom',     type: 'blinds',     name: 'Blinds',         icon: '🪟', on: true,  position: 60 },
  { id: 'of-desk',   room: 'Office',      type: 'light',      name: 'Desk Light Strip', icon: '🌈', on: true, brightness: 55 },
  { id: 'gar-door',  room: 'Garage',      type: 'lock',       name: 'Garage Door',    icon: '🚗', on: true },
];

window.DeskDevices = {
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem('deskbuddy.devices'));
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (e) {}
    return structuredClone(DEFAULT_DEVICES);
  },
  save(list) {
    try { localStorage.setItem('deskbuddy.devices', JSON.stringify(list)); } catch (e) {}
  },
  reset() {
    try { localStorage.removeItem('deskbuddy.devices'); } catch (e) {}
    return structuredClone(DEFAULT_DEVICES);
  },
  summary(list) {
    const active = list.filter(d => d.on && (d.type === 'light' || d.type === 'plug')).length;
    const th = list.find(d => d.type === 'thermostat');
    const door = list.find(d => d.id === 'door-front');
    return {
      active,
      temp: th ? `${th.target}°` : '–',
      door: door ? (door.on ? 'Locked' : 'Unlocked') : '–',
    };
  }
};
