import test from 'node:test';
import assert from 'node:assert/strict';
import { OAuthState, TokenSession } from '../src/oauth.mjs';
import { ConnectorError } from '../src/errors.mjs';
import { rejectsCode, throwsCode, tokenStore, tokens } from './helpers.mjs';

const redirectUri = 'https://connector.example.invalid/oauth/hue/callback';
const callback = state => `${redirectUri}?state=${state}&code=synthetic-code`;

test('OAuth state is random, bound to the session, and consumed once', async () => {
  const oauth = new OAuthState({ redirectUri });
  const state = await oauth.begin('session-a');
  assert.match(state, /^[a-f0-9]{64}$/);
  assert.notEqual(state, await oauth.begin('session-a'));
  await rejectsCode(() => oauth.consume(callback(state), 'session-b'), 'INVALID_STATE');
  assert.equal(await oauth.consume(callback(state), 'session-a'), 'synthetic-code');
  await rejectsCode(() => oauth.consume(callback(state), 'session-a'), 'INVALID_STATE');
});

test('only one concurrent callback can consume a state', async () => {
  const oauth = new OAuthState({ redirectUri });
  const state = await oauth.begin('session');
  const results = await Promise.allSettled([oauth.consume(callback(state), 'session'), oauth.consume(callback(state), 'session')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

test('expired and missing states fail closed', async () => {
  let now = 1000;
  const oauth = new OAuthState({ redirectUri, now: () => now, ttlMs: 10 });
  const state = await oauth.begin('session');
  now += 10;
  await rejectsCode(() => oauth.consume(callback(state), 'session'), 'INVALID_STATE');
  await rejectsCode(() => oauth.consume(`${redirectUri}?code=x`, 'session'), 'INVALID_STATE');
});

test('callback requires exact HTTPS origin and path, without fragments or userinfo', async () => {
  for (const invalid of ['http://example.invalid/oauth/hue/callback', 'https://example.invalid/callback', `${redirectUri}?x=y`, `${redirectUri}#x`]) {
    throwsCode(() => new OAuthState({ redirectUri: invalid }), 'INVALID_CALLBACK');
  }
  const oauth = new OAuthState({ redirectUri });
  const state = await oauth.begin('session');
  for (const invalid of [callback(state).replace('connector.', 'evil.'), callback(state).replace('/oauth/', '/other/'),
    callback(state).replace('https://', 'https://user@'), `${callback(state)}#fragment`]) {
    await rejectsCode(() => oauth.consume(invalid, 'session'), 'INVALID_CALLBACK');
  }
});

test('callback rejects parameter pollution and both code and error', async () => {
  const oauth = new OAuthState({ redirectUri });
  const state = await oauth.begin('session');
  for (const suffix of ['&state=other', '&code=other', '&error=denied', '&returnTo=https://evil.invalid', '&access_token=synthetic']) {
    await rejectsCode(() => oauth.consume(callback(state) + suffix, 'session'), 'INVALID_CALLBACK');
  }
});

test('authorization denial consumes state and omits provider error details', async () => {
  const oauth = new OAuthState({ redirectUri });
  const state = await oauth.begin('session');
  await rejectsCode(() => oauth.consume(`${redirectUri}?state=${state}&error=PRIVATE_DETAIL`, 'session'), 'AUTHORIZATION_DENIED');
  await rejectsCode(() => oauth.consume(callback(state), 'session'), 'INVALID_STATE');
});

test('exchange returns status only, stores encrypted tokens, and reuses unexpired token', async () => {
  const store = await tokenStore();
  let refreshes = 0;
  const session = new TokenSession({ store, now: () => 0, provider: {
    exchange: async input => { assert.deepEqual(input, { code: 'synthetic-code', redirectUri }); return tokens(); },
    refresh: async () => { refreshes++; },
  } });
  assert.deepEqual(await session.exchange('synthetic-code', redirectUri), { connected: true });
  assert.equal(await session.accessToken(), 'synthetic-access');
  assert.equal(refreshes, 0);
});

test('refresh rotates tokens, serializes concurrent requests, and saves before use', async () => {
  const store = await tokenStore();
  let now = 0;
  let refreshes = 0;
  const session = new TokenSession({ store, now: () => now, provider: {
    exchange: async () => tokens({ expires_in: 1 }),
    refresh: async value => {
      assert.equal(value, 'synthetic-refresh'); refreshes++;
      return tokens({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' });
    },
  } });
  await session.exchange('synthetic-code', redirectUri);
  now = 1000;
  assert.deepEqual(await Promise.all([session.accessToken(), session.accessToken()]), ['rotated-access', 'rotated-access']);
  assert.equal(refreshes, 1);
  assert.equal((await store.read()).refresh_token, 'rotated-refresh');
});

test('refresh retains the old refresh token when provider omits it', async () => {
  const store = await tokenStore();
  const session = new TokenSession({ store, now: () => 0, provider: {
    exchange: async () => tokens({ expires_in: 1 }),
    refresh: async () => tokens({ refresh_token: undefined }),
  } });
  await session.exchange('code', redirectUri);
  await session.accessToken();
  assert.equal((await store.read()).refresh_token, 'synthetic-refresh');
});

test('invalid grant clears tokens; transient refresh error is sanitized', async () => {
  const store = await tokenStore();
  let invalidGrant = false;
  const session = new TokenSession({ store, now: () => 0, provider: {
    exchange: async () => tokens({ expires_in: 1 }),
    refresh: async () => { throw invalidGrant ? new ConnectorError('REAUTHORIZE') : new Error('SECRET_PROVIDER_BODY'); },
  } });
  await session.exchange('code', redirectUri);
  await rejectsCode(() => session.accessToken(), 'TOKEN_REFRESH_FAILED');
  assert.ok(await store.read());
  invalidGrant = true;
  await rejectsCode(() => session.accessToken(), 'REAUTHORIZE');
  assert.equal(await store.read(), null);
});

test('malformed token responses never persist or produce access', async () => {
  for (const invalid of [tokens({ access_token: '' }), tokens({ token_type: 1 }), tokens({ expires_in: -1 }),
    tokens({ expires_in: Infinity }), tokens({ refresh_token: null }), tokens({ token_type: 'Basic' })]) {
    const store = await tokenStore();
    const session = new TokenSession({ store, provider: { exchange: async () => invalid } });
    await rejectsCode(() => session.exchange('code', redirectUri), 'INVALID_RESPONSE');
    assert.equal(await store.read(), null);
  }
});

test('exchange failure does not expose provider secrets', async () => {
  const store = await tokenStore();
  const session = new TokenSession({ store, provider: { exchange: async () => { throw new Error('PRIVATE_SECRET'); } } });
  await rejectsCode(() => session.exchange('code', redirectUri), 'TOKEN_EXCHANGE_FAILED');
});

test('disconnect clears locally before revocation, even when remote revocation fails', async () => {
  const store = await tokenStore();
  const session = new TokenSession({ store, provider: {
    exchange: async () => tokens(),
    revoke: async token => {
      assert.equal(token, 'synthetic-refresh'); assert.equal(await store.read(), null);
      throw new Error('secret');
    },
  } });
  await session.exchange('code', redirectUri);
  assert.deepEqual(await session.disconnect(), { local: 'disconnected', remote: 'failed' });
  await rejectsCode(() => session.accessToken(), 'REAUTHORIZE');
});

test('successful and unsupported revocation are distinguished', async () => {
  for (const supported of [true, false]) {
    const session = new TokenSession({ store: await tokenStore(), provider: {
      exchange: async () => tokens(), ...(supported ? { revoke: async () => {} } : {}),
    } });
    await session.exchange('code', redirectUri);
    assert.equal((await session.disconnect()).remote, supported ? 'revoked' : 'unsupported');
  }
});
