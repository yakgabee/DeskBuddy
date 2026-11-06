// Spotify Web API client (Authorization Code + PKCE, no client secret).
(() => {
  const cfg = window.DESKBUDDY_CONFIG.spotify;
  const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
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
    };
    store.set(saved);
    return saved;
  }

  // Returns a valid access token. Only logs out when Spotify itself rejects the
  // login — a Wi-Fi blip keeps you logged in and just retries later.
  async function accessToken(forceRefresh = false) {
    const s = store.get();
    if (!s) throw fail('Not logged in', 'auth');
    if (!forceRefresh && Date.now() < s.expiresAt) return s.accessToken;
    try {
      return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken })).accessToken;
    } catch (e) {
      if (e.code === 'auth') store.clear();
      throw e;
    }
  }

  async function api(path, method = 'GET', retried = false) {
    const token = await accessToken(retried);
    let res;
    try {
      res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      throw fail('Can\'t reach Spotify', 'network');
    }
    if (res.status === 401) {
      if (!retried) return api(path, method, true); // token went stale early: refresh once
      store.clear();
      throw fail('Spotify login expired', 'auth');
    }
    if (res.status === 429) {
      throw fail('Spotify asked us to slow down', 'rate', { retryAfter: Number(res.headers.get('Retry-After')) || 30 });
    }
    if (res.status === 403 && method !== 'GET') throw fail('Playback controls need Spotify Premium', 'premium');
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
      const d = await api('/me/player/currently-playing?additional_types=episode');
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
      };
    },

    play() { return api('/me/player/play', 'PUT'); },
    pause() { return api('/me/player/pause', 'PUT'); },
    next() { return api('/me/player/next', 'POST'); },
    previous() { return api('/me/player/previous', 'POST'); },
  };
})();
