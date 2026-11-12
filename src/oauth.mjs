import { fail, ConnectorError } from './errors.mjs';

const encoder = new TextEncoder();
const opaque = value => typeof value === 'string' && value.length >= 1 && value.length <= 4096;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));

function callbackBase(value) {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_CALLBACK'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search
      || url.pathname === '/callback') fail('INVALID_CALLBACK');
  return url;
}

// Memory-only, single-process test primitive. Production needs an atomic,
// shared, TTL-bound store and an authenticated browser session (see PLAN.md).
export class OAuthState {
  #pending = new Map();
  constructor({ redirectUri, now = Date.now, ttlMs = 300_000 } = {}) {
    this.redirectUri = callbackBase(redirectUri).href;
    this.now = now;
    this.ttlMs = ttlMs;
  }
  async begin(sessionId) {
    if (!opaque(sessionId)) fail('INVALID_INPUT');
    for (const [key, entry] of this.#pending) {
      if (entry.expiresAt <= this.now()) this.#pending.delete(key);
    }
    if (this.#pending.size >= 100) fail('RATE_LIMITED', 300);
    const state = hex(crypto.getRandomValues(new Uint8Array(32)));
    this.#pending.set(await digest(state), {
      session: await digest(sessionId), expiresAt: this.now() + this.ttlMs,
    });
    return state;
  }
  async consume(callbackUrl, sessionId) {
    let url;
    try { url = new URL(callbackUrl); } catch { fail('INVALID_CALLBACK'); }
    const expected = new URL(this.redirectUri);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname
        || url.username || url.password || url.hash) fail('INVALID_CALLBACK');
    if (Array.from(url.searchParams.keys()).some(key => !['state', 'code', 'error'].includes(key))
        || ['state', 'code', 'error'].some(key => url.searchParams.getAll(key).length > 1)
        || url.searchParams.has('code') === url.searchParams.has('error')) fail('INVALID_CALLBACK');
    const state = url.searchParams.get('state');
    if (!opaque(sessionId) || typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) fail('INVALID_STATE');
    const key = await digest(state);
    const entry = this.#pending.get(key);
    if (!entry || entry.expiresAt <= this.now() || entry.session !== await digest(sessionId)) fail('INVALID_STATE');
    // Delete synchronously after final await, checking identity again to stop
    // two callbacks that both read an entry before hashing their sessions.
    if (this.#pending.get(key) !== entry) fail('INVALID_STATE');
    this.#pending.delete(key);
    if (url.searchParams.has('error')) fail('AUTHORIZATION_DENIED');
    const code = url.searchParams.get('code');
    if (!opaque(code)) fail('INVALID_CALLBACK');
    return code; // Server-only exchange input; never a tool response or log.
  }
}

function normalizeTokens(raw, now, previousRefresh) {
  if (!raw || !opaque(raw.access_token) || typeof raw.token_type !== 'string'
      || raw.token_type.toLowerCase() !== 'bearer'
      || !Number.isFinite(raw.expires_in) || raw.expires_in <= 0
      || raw.expires_in > 31_536_000
      || !opaque(raw.refresh_token ?? previousRefresh)) fail('INVALID_RESPONSE');
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token ?? previousRefresh,
    expires_at: now + raw.expires_in * 1000,
  };
}

// Provider port has exchange({code, redirectUri}), refresh(refreshToken), and
// optionally revoke(refreshToken). It deliberately has no Hue URLs or fetch.
export class TokenSession {
  #queue = Promise.resolve();
  constructor({ provider, store, now = Date.now }) {
    this.provider = provider;
    this.store = store;
    this.now = now;
  }
  #serial(operation) {
    const result = this.#queue.then(operation);
    this.#queue = result.catch(() => {});
    return result;
  }
  exchange(code, redirectUri) {
    return this.#serial(async () => {
      if (!opaque(code)) fail('INVALID_INPUT');
      callbackBase(redirectUri);
      let tokens;
      try { tokens = await this.provider.exchange({ code, redirectUri }); }
      catch { fail('TOKEN_EXCHANGE_FAILED'); }
      await this.store.write(normalizeTokens(tokens, this.now()));
      return { connected: true }; // Never return tokens through the public surface.
    });
  }
  accessToken() {
    return this.#serial(async () => {
      const saved = await this.store.read();
      if (!saved) fail('REAUTHORIZE');
      if (saved.expires_at > this.now() + 30_000) return saved.access_token;
      let raw;
      try { raw = await this.provider.refresh(saved.refresh_token); }
      catch (error) {
        if (error instanceof ConnectorError && error.code === 'REAUTHORIZE') {
          await this.store.clear();
          fail('REAUTHORIZE');
        }
        fail('TOKEN_REFRESH_FAILED');
      }
      const updated = normalizeTokens(raw, this.now(), saved.refresh_token);
      await this.store.write(updated);
      return updated.access_token;
    });
  }
  disconnect() {
    return this.#serial(async () => {
      const saved = await this.store.read();
      await this.store.clear();
      if (!saved) return { local: 'disconnected', remote: 'not_attempted' };
      if (!this.provider.revoke) return { local: 'disconnected', remote: 'unsupported' };
      try {
        await this.provider.revoke(saved.refresh_token);
        return { local: 'disconnected', remote: 'revoked' };
      } catch { return { local: 'disconnected', remote: 'failed' }; }
    });
  }
}
