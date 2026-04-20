import { supabase } from './supabase';
import { session } from './session.svelte';

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = 'SHA-256';
const AES_KEY_LENGTH = 256;
const SALT_BYTES = 32;
const IV_BYTES = 12;

// --- pure crypto helpers (unit-testable) ---------------------------------

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const mat = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    mat,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptKey(plaintext: string, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as BufferSource
  );
}

export async function decryptKey(ciphertext: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

// --- high-level API --------------------------------------------------------

export type VaultKeyRow = {
  id: string;
  provider_id: string;
  instance_id: string | null;
  label: string | null;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
  kdf_iterations: number;
};

/** Attempt to unlock the vault with the given passphrase.
 *
 *  Returns `true` if:
 *  - the passphrase successfully decrypts the first stored row (new key cached), OR
 *  - the vault is empty (no rows to verify against — any passphrase "unlocks"; no key cached)
 *
 *  The empty-vault case clears any stale cached key from a prior session
 *  so a subsequent `storeBYOKKey` derives fresh state.
 */
export async function unlockVault(passphrase: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.from('byok_keys').select('*').limit(1);
  if (error) return false;
  if (!data || data.length === 0) {
    // No keys stored yet — treat this passphrase as the new master.
    // Clear any stale cached key from a prior session so a subsequent
    // storeBYOKKey derives fresh state.
    session._setVaultKey(null);
    return true;
  }
  const row = data[0] as unknown as { ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array };
  try {
    const k = await deriveKey(passphrase, row.salt);
    await decryptKey(row.ciphertext.buffer as ArrayBuffer, k, row.iv);
    session._setVaultKey(k);
    return true;
  } catch {
    return false;
  }
}

export function lockVault(): void {
  session._setVaultKey(null);
}

export async function storeBYOKKey(
  providerId: string,
  instanceId: string | null,
  apiKey: string,
  label: string | null,
  passphrase: string
): Promise<void> {
  if (!supabase) throw new Error('Auth not enabled');
  const user = session.currentUser;
  if (!user) throw new Error('Not signed in');
  const salt = generateSalt();
  const iv = generateIv();
  const key = await deriveKey(passphrase, salt);
  const plaintext = JSON.stringify({ providerId, apiKey });
  const ciphertext = await encryptKey(plaintext, key, iv);

  const { error } = await supabase.from('byok_keys').upsert({
    owner_id: user.id,
    provider_id: providerId,
    instance_id: instanceId,
    label,
    ciphertext: new Uint8Array(ciphertext),
    iv,
    salt,
    kdf_iterations: PBKDF2_ITERATIONS,
    kdf_hash: PBKDF2_HASH
  });
  if (error) throw error;
  session._setVaultKey(key);
}

export async function rotatePassphrase(oldP: string, newP: string): Promise<void> {
  if (!supabase) throw new Error('Auth not enabled');
  const { data: fullRows, error: fetchErr } = await supabase.from('byok_keys').select('*');
  if (fetchErr || !fullRows) throw fetchErr ?? new Error('No vault');

  const rows = fullRows as unknown as Array<{
    id: string;
    owner_id: string;
    provider_id: string;
    instance_id: string | null;
    label: string | null;
    ciphertext: Uint8Array;
    iv: Uint8Array;
    salt: Uint8Array;
  }>;

  // Decrypt all with old passphrase (one salt per row — but they share
  // session-level semantics; use each row's stored salt).
  const decrypted: Array<{ id: string; row: (typeof rows)[number]; plaintext: string }> = [];
  for (const r of rows) {
    const oldKey = await deriveKey(oldP, r.salt);
    const pt = await decryptKey(r.ciphertext.buffer as ArrayBuffer, oldKey, r.iv);
    decrypted.push({ id: r.id, row: r, plaintext: pt });
  }

  // Re-encrypt with new passphrase + fresh salt+iv per row; track the last
  // salt so we can cache the new vault key without a post-loop re-fetch.
  let lastNewSalt: Uint8Array | null = null;
  const updates = await Promise.all(
    decrypted.map(async (d) => {
      const salt = generateSalt();
      const iv = generateIv();
      const newKey = await deriveKey(newP, salt);
      const ct = await encryptKey(d.plaintext, newKey, iv);
      lastNewSalt = salt;
      return {
        id: d.id,
        owner_id: d.row.owner_id,
        provider_id: d.row.provider_id,
        instance_id: d.row.instance_id,
        label: d.row.label,
        ciphertext: new Uint8Array(ct),
        iv,
        salt,
        kdf_iterations: PBKDF2_ITERATIONS,
        kdf_hash: PBKDF2_HASH
      };
    })
  );

  // One atomic upsert — all rows update or none do (server-side statement).
  // Avoids the split-state risk of looping per-row updates.
  if (updates.length > 0) {
    const { error: upErr } = await supabase.from('byok_keys').upsert(updates);
    if (upErr) throw upErr;
  }

  // Cache with the last new salt (captured in loop, no re-fetch, no race).
  if (lastNewSalt) {
    const k = await deriveKey(newP, lastNewSalt);
    session._setVaultKey(k);
  }
}
