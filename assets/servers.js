// DRAFT: demo list of self-hosted servers/services. The real version will
// check each one live (e.g. via a small local status helper, Docker, or
// Uptime Kuma) instead of using this fake data.
const DEFAULT_SERVERS = [
  { id: 'jellyfin',  name: 'Jellyfin',       icon: 'film', desc: 'Media server',          host: '192.168.1.20', port: 8096, status: 'up',   uptimeH: 312, cpu: 18, ram: 42, ping: 12 },
  { id: 'homeassistant', name: 'Home Assistant', icon: 'home', desc: 'Home automation', host: '192.168.1.15', port: 8123, status: 'up',   uptimeH: 1104, cpu: 6, ram: 31, ping: 8 },
  { id: 'pihole',    name: 'Pi-hole',        icon: 'shield', desc: 'Network ad blocker',    host: '192.168.1.2',  port: 80,   status: 'up',   uptimeH: 2210, cpu: 3,  ram: 18, ping: 4 },
  { id: 'nextcloud', name: 'Nextcloud',      icon: 'cloud', desc: 'Files & photos',        host: '192.168.1.20', port: 8443, status: 'warn', uptimeH: 46,  cpu: 71, ram: 83, ping: 240 },
  { id: 'immich',    name: 'Immich',         icon: 'image', desc: 'Photo backup',          host: '192.168.1.20', port: 2283, status: 'up',   uptimeH: 312, cpu: 9,  ram: 37, ping: 15 },
  { id: 'qbit',      name: 'qBittorrent',    icon: 'download', desc: 'Downloads',             host: '192.168.1.20', port: 8080, status: 'up',   uptimeH: 98,  cpu: 12, ram: 22, ping: 10 },
  { id: 'portainer', name: 'Portainer',      icon: 'box', desc: 'Docker management',     host: '192.168.1.20', port: 9443, status: 'up',   uptimeH: 312, cpu: 2,  ram: 9,  ping: 9 },
  { id: 'minecraft', name: 'Minecraft',      icon: 'gamepad', desc: 'Game server',           host: '192.168.1.30', port: 25565, status: 'down', uptimeH: 0,  cpu: 0,  ram: 0,  ping: null },
];

window.DeskServers = {
  load() { return structuredClone(DEFAULT_SERVERS); },
  summary(list) {
    const up = list.filter(s => s.status !== 'down').length;
    return { up, total: list.length, issues: list.filter(s => s.status !== 'up').length };
  },
  // Small random wiggle so the demo feels live.
  jitter(list) {
    list.forEach(s => {
      if (s.status === 'down') return;
      const j = (v, r, min, max) => Math.max(min, Math.min(max, Math.round(v + (Math.random() - 0.5) * r)));
      s.cpu = j(s.cpu, 8, 1, 99);
      s.ram = j(s.ram, 3, 1, 99);
      s.ping = j(s.ping, s.status === 'warn' ? 60 : 4, 2, 999);
    });
  },
};
