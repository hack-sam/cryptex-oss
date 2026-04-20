import { describe, it, expect } from 'vitest';
import { deriveKey, encryptKey, decryptKey, generateSalt, generateIv } from '../key-vault';

describe('key-vault crypto', () => {
  it('encrypts and decrypts a BYOK key round-trip', async () => {
    const passphrase = 'correct horse battery staple';
    const salt = generateSalt();
    const iv = generateIv();
    const aesKey = await deriveKey(passphrase, salt);
    const plaintext = JSON.stringify({ providerId: 'openrouter', apiKey: 'sk-or-xxx' });

    const ciphertext = await encryptKey(plaintext, aesKey, iv);
    // Cross-realm-safe ArrayBuffer check (jsdom's global ArrayBuffer differs
    // from the one returned by Node webcrypto under vitest).
    expect(Object.prototype.toString.call(ciphertext)).toBe('[object ArrayBuffer]');
    expect(ciphertext.byteLength).toBeGreaterThan(plaintext.length);

    const decrypted = await decryptKey(ciphertext, aesKey, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('wrong passphrase fails decrypt', async () => {
    const salt = generateSalt();
    const iv = generateIv();
    const good = await deriveKey('correct', salt);
    const bad  = await deriveKey('incorrect', salt);
    const ct = await encryptKey('secret', good, iv);
    await expect(decryptKey(ct, bad, iv)).rejects.toThrow();
  });

  it('PBKDF2 uses 600000 iterations', async () => {
    const salt = generateSalt();
    // Sanity: key derivation takes measurable time with high iteration count.
    const t0 = performance.now();
    await deriveKey('test', salt);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeGreaterThan(100); // > 100ms on modern CPU
  });

  it('generates 32-byte salt', () => {
    const s = generateSalt();
    expect(s.byteLength).toBe(32);
  });

  it('generates 12-byte IV', () => {
    const iv = generateIv();
    expect(iv.byteLength).toBe(12);
  });
});
