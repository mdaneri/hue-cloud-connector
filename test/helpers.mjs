import assert from 'node:assert/strict';
import { encryptedTokenStore, memoryBackend } from '../src/secrets.mjs';

// Fail immediately if any tested code accidentally attempts network access.
globalThis.fetch = async () => { throw new Error('Network forbidden in offline tests'); };
export const rejectsCode = (operation, code) => assert.rejects(operation, error => error.code === code);
export const throwsCode = (operation, code) => assert.throws(operation, error => error.code === code);
export async function tokenStore(backend = memoryBackend(), ownerId = 'owner') {
  return encryptedTokenStore({ keyBytes: new Uint8Array(32).fill(17), ownerId, backend });
}
export const tokens = (overrides = {}) => ({
  access_token: 'synthetic-access', refresh_token: 'synthetic-refresh',
  expires_in: 3600, token_type: 'Bearer', ...overrides,
});
