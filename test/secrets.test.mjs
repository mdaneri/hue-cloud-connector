import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptedTokenStore, memoryBackend } from '../src/secrets.mjs';
import { auditRecord, publicError, ConnectorError } from '../src/errors.mjs';
import { tokenStore, rejectsCode } from './helpers.mjs';

test('token storage encrypts and round-trips using random nonces', async () => {
  const backend = memoryBackend();
  const store = await tokenStore(backend);
  const secret = { access_token: 'PRIVATE_ACCESS', refresh_token: 'PRIVATE_REFRESH', expires_at: 10 };
  await store.write(secret);
  const first = await backend.read();
  assert.ok(!JSON.stringify(first).includes('PRIVATE'));
  assert.deepEqual(await store.read(), secret);
  await store.write(secret);
  assert.notDeepEqual((await backend.read()).iv, first.iv);
  await store.clear();
  assert.equal(await store.read(), null);
});

test('tampering and cross-owner ciphertext fail closed', async () => {
  const backend = memoryBackend();
  const store = await tokenStore(backend);
  await store.write({ access_token: 'synthetic' });
  const another = await tokenStore(backend, 'another-owner');
  await rejectsCode(() => another.read(), 'SECRET_STORAGE_FAILED');
  const envelope = await backend.read();
  envelope.ciphertext[0] ^= 1;
  await backend.write(envelope);
  await rejectsCode(() => store.read(), 'SECRET_STORAGE_FAILED');
});

test('invalid encryption keys and backend failures have no plaintext fallback', async () => {
  await rejectsCode(() => encryptedTokenStore({ keyBytes: new Uint8Array(16), ownerId: 'x', backend: memoryBackend() }), 'SECRET_STORAGE_FAILED');
  const store = await tokenStore({ write: async () => { throw new Error('private data'); } });
  await rejectsCode(() => store.write({ access_token: 'private' }), 'SECRET_STORAGE_FAILED');
});

test('audit and public errors discard secret fields, arbitrary strings, URLs and causes', () => {
  const secret = 'https://example.invalid?access_token=PRIVATE_SECRET';
  assert.deepEqual(auditRecord({ event: secret, code: secret, http_status: 401, authorization: secret,
    access_token: secret, refresh_token: secret, error: new Error(secret), url: secret }), { event: 'connector', http_status: 401 });
  assert.deepEqual(publicError(new Error(secret)), { code: 'INTERNAL_ERROR' });
  assert.deepEqual(publicError(new ConnectorError(secret)), { code: 'INTERNAL_ERROR' });
  assert.deepEqual(publicError(new ConnectorError('RATE_LIMITED', 60)), { code: 'RATE_LIMITED', retry_after_seconds: 60 });
});
