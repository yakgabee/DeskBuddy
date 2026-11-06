// Demo player used when the page is opened with ?demo (no Spotify login).
// Songs and lyrics below are made up.
window.MockPlayer = {
  tracks: [
    {
      title: 'Neon Afternoon', artist: 'The Paper Satellites', album: 'Signals From Home',
      bg: '#e4572e', fg: '#fff4e6',
      duration: 200,
      lyrics: [
        [0, '♪'],
        [8, 'Sunlight spilling on the keyboard'],
        [14, 'Coffee cooling by the screen'],
        [20, 'Every window holds a city'],
        [26, 'Every city holds a dream'],
        [33, 'And I hum a little louder'],
        [39, 'When the afternoon turns gold'],
        [46, 'Neon afternoon, stay a while'],
        [52, 'Light me up in every color'],
        [58, 'Neon afternoon, make me smile'],
        [64, 'Till the evening finds another'],
        [72, '♪'],
        [80, 'Headphones on, the world is quiet'],
        [86, 'Just the rhythm and the rain'],
        [92, 'Tiny moments, tiny riots'],
        [98, 'Playing over once again'],
        [106, 'Neon afternoon, stay a while'],
        [112, 'Light me up in every color'],
        [118, 'Neon afternoon, make me smile'],
        [124, 'Till the evening finds another'],
        [140, '♪'],
      ],
    },
    {
      title: 'Low Tide Radio', artist: 'Marlow Vale', album: 'Coastline Static',
      bg: '#1d3557', fg: '#a8dadc',
      duration: 185,
      lyrics: [
        [0, '♪'],
        [6, 'Tuning in to the low tide radio'],
        [12, 'Songs that only the ocean knows'],
        [19, 'Static whispers, the signal fades'],
        [25, 'Carry me out on the evening waves'],
        [33, '♪'],
        [40, 'Salt on the dial, sand in my shoes'],
        [46, 'Every station is playing the blues'],
        [53, 'But I keep listening, I keep the light'],
        [59, 'Low tide radio, play through the night'],
        [70, '♪'],
      ],
    },
    {
      title: 'Paper Planets', artist: 'Juniper & The Hum', album: 'Small Universe',
      bg: '#e9c46a', fg: '#264653',
      duration: 214,
      lyrics: [
        [0, '♪'],
        [7, 'I folded you a paper planet'],
        [13, 'Hung it up above the bed'],
        [19, 'Told you every star was handmade'],
        [25, 'Every orbit in my head'],
        [32, 'Spin, spin, little world of mine'],
        [38, 'Turning slow in borrowed light'],
        [45, '♪'],
      ],
    },
  ],
  index: 0,
  position: 34,
  playing: true,
  get current() { return this.tracks[this.index]; },
  next() { this.index = (this.index + 1) % this.tracks.length; this.position = 0; },
  prev() {
    if (this.position > 3) { this.position = 0; return; }
    this.index = (this.index - 1 + this.tracks.length) % this.tracks.length; this.position = 0;
  },
  toggle() { this.playing = !this.playing; },
  tick(dt) {
    if (!this.playing) return;
    this.position += dt;
    if (this.position >= this.current.duration) this.next();
  },
};
