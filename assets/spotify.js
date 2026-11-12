// Spotify Web API client (Authorization Code + PKCE, no client secret).
(() => {
  const cfg = window.DESKBUDDY_CONFIG.spotify;
  const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative';
  const KEY = 'deskbuddy.spotify';
  const API = 'https://api.spotify.com/v1';

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} },
    clear() { try { localStorage.removeItem(KEY); } catch (e) {} },
  };

  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const randomString = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

  const fail = (message, code, extra = {}) => Object.assign(new Error(message), { code, ...extra });

  async function tokenRequest(params) {
    let res;
    try {
      res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: cfg.clientId, ...params }),
      });
    } catch (e) {
      throw fail('Can\'t reach Spotify', 'network');
    }
    // 400/401 means Spotify rejected the login (e.g. access was removed).
    if (res.status === 400 || res.status === 401) throw fail('Spotify login expired', 'auth');
    if (!res.ok) throw fail(`Spotify token error ${res.status}`, 'network');
    const t = await res.json();
    const prev = store.get() || {};
    const saved = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token || prev.refreshToken,
      expiresAt: Date.now() + (t.expires_in - 60) * 1000,
      scope: t.scope || prev.scope || '',
    };
    store.set(saved);
    return saved;
  }

  // Returns a valid access token. Only one renewal runs at a time: Spotify replaces the
  // refresh token on every renewal, so two at once would make the second one fail and
  // look like a logout. A Wi-Fi blip keeps you logged in and just retries later.
  let refreshing = null;
  async function accessToken(forceRefresh = false) {
    const s = store.get();
    if (!s) throw fail('Not logged in', 'auth');
    if (!forceRefresh && Date.now() < s.expiresAt) return s.accessToken;
    if (!refreshing) {
      const used = s.refreshToken;
      refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: used })
        .then(t => t.accessToken)
        .catch(e => {
          // Already renewed elsewhere (e.g. by a second window)? Then use that login.
          const now = store.get();
          if (now && now.refreshToken !== used && Date.now() < now.expiresAt) return now.accessToken;
          if (e.code === 'auth') store.clear();
          throw e;
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function api(path, method = 'GET', retried = false, body = null, renew = retried) {
    const token = await accessToken(renew);
    let res;
    try {
      res = await fetch(API + path, {
        method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw fail('Can\'t reach Spotify', 'network');
    }
    if (res.status === 401) {
      // Renewed by another request in the meantime? Retry with the new token instead of renewing again.
      if (!retried && store.get()?.accessToken && store.get().accessToken !== token) return api(path, method, true, body, false);
      if (!retried) return api(path, method, true, body); // token went stale early: refresh once
      store.clear();
      throw fail('Spotify login expired', 'auth');
    }
    if (res.status === 429) {
      throw fail('Spotify asked us to slow down', 'rate', { retryAfter: Number(res.headers.get('Retry-After')) || 30 });
    }
    if (res.status === 403 && method !== 'GET') throw fail('Playback controls need Spotify Premium', 'premium');
    if (res.status === 404 && method !== 'GET') throw fail('No active Spotify device', 'no_device');
    if (res.status === 403 || res.status === 404) throw fail('Spotify won\'t share that', 'forbidden');
    if (res.status === 204 || res.status === 202) return null;
    if (!res.ok) throw fail(`Spotify error ${res.status}`, 'network');
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  window.Spotify = {
    // True when the page is open at the address Spotify will send you back to.
    onRedirectOrigin() {
      return location.origin === new URL(cfg.redirectUri).origin;
    },
    isLoggedIn() { return !!store.get(); },
    // Logins from before playlists were added don't include them: reconnect once.
    canReadPlaylists() { return (store.get()?.scope || '').includes('playlist-read-private'); },

    async login() {
      const verifier = randomString(64);
      const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const state = randomString(16);
      sessionStorage.setItem('deskbuddy.pkce', JSON.stringify({ verifier, state }));
      const q = new URLSearchParams({
        response_type: 'code', client_id: cfg.clientId, scope: SCOPES,
        redirect_uri: cfg.redirectUri, code_challenge_method: 'S256',
        code_challenge: challenge, state,
      });
      location.href = `https://accounts.spotify.com/authorize?${q}`;
    },

    // Call on page load: finishes the login if Spotify just redirected back.
    async handleRedirect() {
      const q = new URLSearchParams(location.search);
      if (!q.has('code') && !q.has('error')) return;
      const pkce = JSON.parse(sessionStorage.getItem('deskbuddy.pkce') || '{}');
      sessionStorage.removeItem('deskbuddy.pkce');
      history.replaceState(null, '', location.pathname);
      if (q.get('error')) throw new Error(`Spotify login cancelled (${q.get('error')})`);
      if (!pkce.verifier || q.get('state') !== pkce.state) throw new Error('Spotify login failed, please try again');
      await tokenRequest({
        grant_type: 'authorization_code', code: q.get('code'),
        redirect_uri: cfg.redirectUri, code_verifier: pkce.verifier,
      });
    },

    logout() { store.clear(); },

    // Returns null when nothing is playing.
    async nowPlaying() {
      // /me/player = what's playing plus the device (for its volume).
      const d = await api('/me/player?additional_types=episode');
      if (!d || !d.item) return null;
      const it = d.item;
      const isEp = it.type === 'episode';
      const images = isEp ? (it.images || it.show?.images || []) : (it.album?.images || []);
      return {
        id: it.id,
        title: it.name,
        artist: isEp ? it.show?.publisher || it.show?.name : it.artists.map(a => a.name).join(', '),
        album: isEp ? it.show?.name : it.album?.name,
        image: images[0]?.url || null,
        duration: it.duration_ms / 1000,
        position: (d.progress_ms || 0) / 1000,
        playing: d.is_playing,
        isEpisode: isEp,
        device: d.device?.name || null,
        volume: d.device?.volume_percent ?? null,
        supportsVolume: d.device ? d.device.supports_volume !== false && d.device.volume_percent != null : false,
      };
    },

    play() { return api('/me/player/play', 'PUT'); },
    pause() { return api('/me/player/pause', 'PUT'); },
    next() { return api('/me/player/next', 'POST'); },
    previous() { return api('/me/player/previous', 'POST'); },
    // Spotify Connect: the devices you can play on (Spotify open on them), and moving playback.
    async devices() {
      const d = await api('/me/player/devices');
      return (d?.devices || []).filter(x => x && x.id).map(x => ({
        id: x.id, name: x.name, type: x.type || '', active: !!x.is_active, restricted: !!x.is_restricted,
      }));
    },
    transfer(id, play = true) { return api('/me/player', 'PUT', false, { device_ids: [id], play }); },
    setVolume(percent) { return api(`/me/player/volume?volume_percent=${Math.round(percent)}`, 'PUT'); },

    // ---------- Search ----------
    async search(q) {
      const d = await api(`/search?${new URLSearchParams({ q, type: 'track,artist,album,playlist', limit: '8' })}`);
      const img = imgs => (imgs || []).slice(-2)[0]?.url || imgs?.[0]?.url || null;   // a small one
      return {
        tracks: (d?.tracks?.items || []).filter(Boolean).map(t => ({
          kind: 'track', uri: t.uri, title: t.name, sub: t.artists.map(a => a.name).join(', '),
          image: img(t.album?.images), duration: t.duration_ms / 1000, explicit: t.explicit })),
        artists: (d?.artists?.items || []).filter(Boolean).map(a => ({
          kind: 'artist', uri: a.uri, title: a.name, sub: 'Artist', image: img(a.images) })),
        albums: (d?.albums?.items || []).filter(Boolean).map(a => ({
          kind: 'album', uri: a.uri, title: a.name, sub: `${a.artists.map(x => x.name).join(', ')} · ${(a.release_date || '').slice(0, 4)}`,
          image: img(a.images) })),
        playlists: (d?.playlists?.items || []).filter(Boolean).map(p => ({
          kind: 'playlist', uri: p.uri, title: p.name, sub: `Playlist · ${p.owner?.display_name || ''}`, image: img(p.images) })),
      };
    },

    async myPlaylists() {
      const d = await api('/me/playlists?limit=30');
      return (d?.items || []).filter(Boolean).map(p => {
        const n = p.items?.total ?? p.tracks?.total;
        return { kind: 'playlist', uri: p.uri, title: p.name, image: (p.images || []).slice(-2)[0]?.url || p.images?.[0]?.url || null,
          sub: n != null ? `${n} song${n === 1 ? '' : 's'}` : 'Playlist' };
      });
    },

    // Songs in a playlist (yours or one you collaborate on) or an album, 50 at a time.
    async songs(item, offset = 0) {
      const id = item.uri.split(':').pop();
      const toSong = (t, image) => t && t.uri && {
        kind: 'track', uri: t.uri, title: t.name, duration: (t.duration_ms || 0) / 1000, explicit: t.explicit,
        sub: (t.artists || []).map(a => a.name).join(', ') || t.show?.name || '',
        image: image || (t.album?.images || []).slice(-1)[0]?.url || null,
      };
      if (item.kind === 'album') {
        const a = await api(`/albums/${id}/tracks?limit=50&offset=${offset}`);
        return { songs: (a?.items || []).map(t => toSong(t, item.image)).filter(Boolean), total: a?.total || 0 };
      }
      const d = await api(`/playlists/${id}/items?limit=50&offset=${offset}`);
      // Each entry holds the song as "item" (or "track" on older responses).
      return { songs: (d?.items || []).map(x => toSong(x?.item || x?.track)).filter(Boolean), total: d?.total || 0 };
    },


    // Play a search result. With nothing playing anywhere, start it on the
    // first Spotify device that's online (your PC, phone, a speaker…).
    async playItem(item, startAt = null) {
      const body = item.kind === 'track' ? { uris: [item.uri] } : { context_uri: item.uri };
      if (startAt) body.offset = { uri: startAt };   // start a playlist/album at this song
      try {
        return await api('/me/player/play', 'PUT', false, body);
      } catch (e) {
        if (e.code !== 'no_device') throw e;
        const devices = (await api('/me/player/devices'))?.devices || [];
        const dev = devices.find(d => d.is_active) || devices.find(d => !d.is_restricted);
        if (!dev) throw e;
        return api(`/me/player/play?device_id=${encodeURIComponent(dev.id)}`, 'PUT', false, body);
      }
    },
    queue(uri) { return api(`/me/player/queue?uri=${encodeURIComponent(uri)}`, 'POST'); },
  };
})();
