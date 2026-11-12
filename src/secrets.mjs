import { fail } from './errors.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// A storage adapter contract: read/write/clear one encrypted owner record.
// The supplied backend is memory-only in this milestone. No plaintext fallback.
export async function encryptedTokenStore({ keyBytes, ownerId, backend }) {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.length !== 32
      || typeof ownerId !== 'string' || !ownerId) fail('SECRET_STORAGE_FAILED');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const aad = encoder.encode(`hue-connector:v1:${ownerId}`);
  return {
    async write(value) {
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData: aad }, key, encoder.encode(JSON.stringify(value)),
        ));
        await backend.write({ version: 1, iv: Array.from(iv), ciphertext: Array.from(ciphertext) });
      } catch { fail('SECRET_STORAGE_FAILED'); }
    },
    async read() {
      try {
        const envelope = await backend.read();
        if (!envelope) return null;
        if (envelope.version !== 1) fail('SECRET_STORAGE_FAILED');
        const plaintext = await crypto.subtle.decrypt({
          name: 'AES-GCM', iv: Uint8Array.from(envelope.iv), additionalData: aad,
        }, key, Uint8Array.from(envelope.ciphertext));
        return JSON.parse(decoder.decode(plaintext));
      } catch { fail('SECRET_STORAGE_FAILED'); }
    },
    async clear() {
      try { await backend.clear(); } catch { fail('SECRET_STORAGE_FAILED'); }
    },
  };
}

export function memoryBackend() {
  let value = null;
  return {
    async read() { return structuredClone(value); },
    async write(next) { value = structuredClone(next); },
    async clear() { value = null; },
  };
}
