# Auth v2 — Design Spec

**Date:** 2026-04-19
**Sub-project:** E (Auth v2)
**Status:** Approved for planning

## Purpose

Replace the placeholder `ownerId: 'local'` identity shim with real user accounts. Enable cross-device sync. Introduce a tiered model (Guest / Free / Paid) with Godmode as the paid differentiator. Preserve the BYOK security posture even though chat data moves server-side.

## Summary of decisions

| Dimension | Choice |
|---|---|
| Storage model | Server-side by default (Supabase Postgres + Storage + Realtime) |
| Backend | Supabase (Auth + DB + Storage + Realtime + Edge Functions) |
| Identity | Google OAuth + GitHub OAuth only (no email/password, no magic link) |
| BYOK keys | Server-side, AES-256-GCM encrypted with PBKDF2-derived key from user passphrase (zero-knowledge) |
| Tier model | Guest / Free / Paid. Godmode is paid-only; all other AI features are free once signed in |
| Migration | Auto-claim local IndexedDB data on first sign-in |
| Delete | Immediate hard-delete with export bundle; GDPR right-to-erasure |
| Sync | Local-first — Dexie authoritative, background push to Supabase, LWW by `updatedAt` |
| Billing | Stripe Checkout + Customer Portal via Supabase Edge Functions |

## Tier matrix

| Surface | Guest | Free (signed in) | Paid |
|---|---|---|---|
| `/transforms` (162 transformers) | YES | YES | YES |
| `/decode`, `/emoji`, other offline tools | YES | YES | YES |
| `/chat` + slash + Attack Chain + all AI tools (PromptCraft, AntiClassifier, Translate) | NO (sign-in wall) | YES | YES |
| `/dataset` + custom presets + Attack Chain history | NO (sign-in wall) | YES | YES |
| Cross-device sync | — | YES | YES |
| **Godmode jailbreak chains** | NO | NO (upgrade modal) | YES |

## Architecture

### Stack

- **Supabase** for Auth (Google + GitHub OAuth), Postgres, Storage, Realtime, Edge Functions
- **Dexie** stays the authoritative local store; Supabase is the sync target
- **Stripe** for paid-tier billing (single product, single monthly price)
- Existing deploy (Cloudflare Pages / Vercel / Dokploy) unchanged — Supabase is the only always-on backend

### Module additions

- `app/src/lib/auth/supabase.ts` — Supabase client init
- `app/src/lib/auth/session.svelte.ts` — rewritten; reactive `currentUser` from `supabase.auth.onAuthStateChange`
- `app/src/lib/auth/key-vault.ts` — rewritten; passphrase-derived AES-GCM wrap/unwrap
- `app/src/lib/sync/engine.ts` — new local-first sync daemon
- `app/src/lib/billing/entitlement.svelte.ts` — new; `isPaid` derived from JWT claim
- `app/src/lib/components/billing/UpgradeModal.svelte` — new
- `app/src/lib/components/billing/SignInWall.svelte` — new
- `app/src/routes/login/+page.svelte` — new
- `app/src/routes/auth/callback/+page.svelte` — new OAuth callback
- `app/src/routes/account/+page.svelte` — new; passphrase, export, delete
- `supabase/migrations/*.sql` — schema + RLS
- `supabase/functions/create-checkout-session/` — Edge Function
- `supabase/functions/stripe-webhook/` — Edge Function
- `supabase/functions/create-billing-portal-session/` — Edge Function
- `supabase/functions/delete-account/` — Edge Function
- `supabase/functions/export-account/` — Edge Function
- `supabase/functions/godmode-prompt/` — Edge Function (paid-gated)

## Data model

### Postgres schema

Every table mirrors the existing Dexie shape one-to-one so the sync engine is a pure pass-through.

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free',         -- 'free' | 'paid' | 'grace'
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table byok_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  provider_id text not null,
  instance_id text,
  label text,
  ciphertext bytea not null,
  iv bytea not null,
  salt bytea not null,
  kdf_iterations int not null default 600000,
  kdf_hash text not null default 'SHA-256',
  updated_at timestamptz not null default now(),
  unique (owner_id, provider_id, instance_id)
);

create table chats (...);              -- matches ChatRow
create table messages (...);            -- matches MessageRow
create table attachments (             -- matches AttachmentRow; blob in Storage
  id uuid primary key,
  owner_id uuid not null references auth.users on delete cascade,
  message_id uuid not null,
  storage_path text not null,           -- '<owner_id>/<attachment_id>.<ext>'
  ...
);
create table attack_chain_runs (...);   -- matches AttackChainRunRow
create table custom_presets (...);      -- matches CustomPreset
```

All synced tables carry `owner_id uuid`, `updated_at timestamptz`, `tombstoned boolean default false`. Indexes: `(owner_id, updated_at)` for sync queries.

### Row-Level Security

Enabled on every table. Policy template:

```sql
alter table <t> enable row level security;
create policy <t>_owner_isolation on <t>
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
```

Godmode endpoint additionally checks `auth.jwt() ->> 'plan' = 'paid'`.

### Storage

Single bucket `attachments` with RLS matching `<owner_id>/*` prefix. Client uploads Blob via Supabase SDK; `attachments.storage_path` carries the bucket path.

## Auth + BYOK passphrase crypto

### OAuth flow

1. `/login` — two OAuth buttons
2. `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: '<origin>/auth/callback' } })`
3. Supabase handles PKCE dance with provider
4. Callback exchanges code for session
5. `session.svelte.ts` flips `currentUser` from `null` to the signed-in shape
6. First sign-in → migration (below) → passphrase prompt → normal app

### Passphrase crypto

All crypto runs browser-side via WebCrypto.

**Setup (first key save after sign-in):**
1. User enters API key + passphrase (12-char minimum, strength meter)
2. Generate 32-byte random salt (persisted server-side)
3. Derive AES-256-GCM key from passphrase + salt via PBKDF2-SHA256 at 600,000 iterations
4. Generate 12-byte random IV per key; encrypt `{providerId, apiKey}` JSON
5. POST `{owner_id, provider_id, instance_id, ciphertext, iv, salt, kdf_iterations, kdf_hash}`
6. Cache derived AES key in session-only Svelte store

**Unlock (subsequent sessions):**
1. Fetch `byok_keys`; if non-empty, prompt for passphrase
2. Derive key with stored salt; attempt decrypt of each row
3. Success on any row → passphrase valid → cache key
4. All fail → prompt retry or destructive-reset

**Key rotation (passphrase change):**
1. Decrypt all rows with old cached key
2. Generate new salt; derive new key from new passphrase
3. Re-encrypt every row with new key+IV; PATCH in transaction
4. Update cached key

**Zero-knowledge property:** Server stores ciphertext + KDF params only. Passphrase never transmitted. Passphrase reset = delete all keys (unrecoverable by design).

### Session shape

```ts
export type CurrentUser = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  plan: 'free' | 'paid' | 'grace';
};

export const session = {
  get current(): CurrentUser | null,
  get vaultUnlocked(): boolean,
  signInWithGoogle(),
  signInWithGitHub(),
  signOut(),
  unlockVault(passphrase: string): Promise<boolean>,
  rotatePassphrase(oldP, newP): Promise<void>,
  lockVault(): void
};
```

## Tier gating + billing

### Entitlement

`profiles.plan` is the source of truth. Pushed into Supabase JWT as custom claim `plan` via function-webhook on every `profiles` update. Client reads `session.current.plan`.

### Gate UX

- **Guest hits any AI surface** → full-page sign-in wall with two OAuth buttons
- **Free hits Godmode** → inline `UpgradeModal` explaining Godmode + Stripe Checkout button
- **Upgrade modal** fires on `billing:show-upgrade` CustomEvent

### Server-side enforcement

- RLS on every synced table enforces `owner_id = auth.uid()`
- Godmode Edge Function checks JWT `plan = 'paid'`, returns 403 otherwise
- Client entitlement check is UX only; server RLS is truth

### Stripe integration

Three Edge Functions:
- `create-checkout-session` — rate-limited 10/min/user; requires session JWT; returns Checkout URL
- `stripe-webhook` — HMAC-verified; idempotent on event ID; handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- `create-billing-portal-session` — returns Stripe customer portal URL

### Grace period

`plan = 'grace'` for 7 days after payment failure. Paid features still unlocked. Amber banner in UI. After 7 days, flips to `'free'`.

## Migration (auto-claim on first sign-in)

Runs once per device when session flips `null → signed-in`.

```ts
async function claimLocalData(newOwnerId: string): Promise<void> {
  await db.transaction('rw',
    db.chats, db.messages, db.attachments, db.attackChainRuns,
    async () => {
      await db.chats.where('ownerId').equals('local').modify({ ownerId: newOwnerId });
      await db.messages.where('ownerId').equals('local').modify({ ownerId: newOwnerId });
      await db.attachments.where('ownerId').equals('local').modify({ ownerId: newOwnerId });
      await db.attackChainRuns.where('ownerId').equals('local').modify({ ownerId: newOwnerId });
    }
  );
}
```

Atomic transaction. After claim, sync engine pushes everything to Supabase. Toast shows progress.

### Edge cases

- Sign in on device B → device B's own local data claimed into same account → sync merges. ULIDs prevent ID collision.
- Sign out + sign in as different account → new local data claims to new account; previously-claimed data stays with its original account.
- Partial failure → transaction rollback; retry button offered.

## Delete (immediate hard-delete + export)

4-click irreversible flow:

1. Settings → Account → **Delete account** (destructive red)
2. Modal explains consequences
3. **Download my data** → `export-account` Edge Function streams ZIP:
   - `chats.jsonl` (ShareGPT)
   - `raw.jsonl` (raw Cryptex schema)
   - `attack-chain-runs.jsonl`
   - `attachments/<id>.<ext>`
   - `account.json` (profile metadata)
4. Type `DELETE <email>` exactly
5. **Delete permanently** → `delete-account` Edge Function:
   - Verifies typed email server-side (defense in depth)
   - `on delete cascade` on `auth.users` purges all rows
   - Storage bucket prefix bulk-deleted
   - Stripe subscription cancelled with retry queue
   - OAuth session revoked
   - Client Dexie purged
   - Sign-out + redirect to `/login`

## Sync engine (local-first)

Single daemon per tab.

**Behavior**
- On sign-in: subscribe to Supabase Realtime filtered by `owner_id = auth.uid()`
- Any Dexie write (via `repo.ts`) enqueues an op in `syncQueue`: `{op, table, rowId, updatedAt}`
- Background tick every 2s: drain queue, batch `upsert({...}, {onConflict: 'id'})` per table
- Incoming Realtime row: compare `updatedAt`; if server > local, write to Dexie

**Conflict resolution**
- Last-writer-wins by `updatedAt` (ULID tie-break)
- Tombstones win regardless of timestamp

**Offline**
- Queue accumulates in Dexie when `navigator.onLine === false`
- Reconnect drains FIFO
- Queue cap 10k ops; coalesce per-row if exceeded

**Init on sign-in**
- Full pull from Supabase (idempotent via `updatedAt` compare)
- Subscribe Realtime
- Start pusher

**Teardown on sign-out**
- Lock vault
- Drop subscriptions
- Optional: purge Dexie rows owned by signed-out user (user setting)

**Backoff** — 1s, 2s, 4s, 8s, 30s cap on errors.

## Safety requirements (non-negotiable)

**OAuth**
- PKCE flow only (not implicit)
- `redirectTo` allowlist pinned to app origins
- Session in httpOnly + Secure + SameSite=Lax cookie

**RLS**
- Enabled on every synced table
- `owner_id = auth.uid()` on `using` AND `with check`
- Negative tests: cross-owner select/update/delete must 0-row
- Godmode policy: `auth.jwt() ->> 'plan' = 'paid'`
- Storage bucket RLS mirrors table RLS

**BYOK crypto**
- WebCrypto only (no third-party libs)
- PBKDF2-SHA256, 600,000 iterations
- 32-byte random salt per user (server-stored)
- 12-byte random IV per encrypt (never reused)
- AES-256-GCM with auth tag
- Passphrase never transmitted, never logged, never persisted
- Reset = delete all keys (documented as destructive)
- Client-side rate-limit 5 failed-unlock attempts per minute

**Edge Functions**
- `stripe-webhook`: HMAC verified before any DB write; idempotent on event ID
- `create-checkout-session`: rate-limited 10/min/user; requires session JWT
- `delete-account`: rate-limited 3/hour/user; server-verifies typed email
- `export-account`: rate-limited 10/day/user; signed URL expires in 15 min; chunked for large datasets

**Migration**
- Single Dexie transaction; atomic rollback
- Idempotent; running twice is a no-op
- Sync push after claim completes, not interleaved

**Delete**
- Irreversible only after: export downloaded + typed email + confirm
- Server re-verifies typed email
- Cascade via `on delete cascade`
- Stripe cancel with retry queue
- User signed out before DB purge
- Client Dexie also purged

**Billing**
- Client check is UX only; server RLS is truth
- JWT claim refreshed on every `profiles` change
- Grace period 7 days on payment failure
- Stripe price IDs in env (not client-readable)
- Service-role key NEVER in client bundle — Edge Functions only

**Session + CSP**
- Existing `connect-src 'self' https:` already permits Supabase + Stripe (no CSP change)
- No regression to `script-src` lockdown
- `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY` — anon key publicly safe via RLS

**Realtime**
- Filtered by `owner_id = auth.uid()` server-side
- Auto-disconnect on sign-out

**Validation**
- Edge Functions validate client-submitted rows with Zod before DB write
- `owner_id` always server-side overwritten to `auth.uid()` on insert

## Testing strategy

**Unit**
- WebCrypto encrypt/decrypt round-trip
- Passphrase rotation correctness (all rows re-encrypted)
- Migration atomicity (transaction rollback on failure)
- Entitlement gates (paid/free/grace/guest matrix)

**Integration (pgtap + Supabase local CLI)**
- RLS negative tests per table: cross-owner select/update/delete = 0 rows
- Godmode JWT claim gating
- Stripe webhook HMAC tamper → 401
- Sync engine: offline queue drain, conflict resolution

**E2E (Playwright against Supabase test project)**
- Guest → sign up → migrate local → create chat → sign out → sign in on second device → same chat appears
- Free → click Godmode → see upgrade modal → Stripe test mode → plan flip → Godmode unlocks
- Paid → rotate passphrase → all BYOK keys still decryptable
- Delete account → export ZIP downloads → type confirm → rows purged + sign out

**Security**
- Stripe webhook signature tamper returns 401
- Direct `byok_keys` table read by non-owner returns 0 rows
- JWT tampered to claim `plan=paid` for free user → Godmode endpoint returns 403 (server verifies against DB, not just JWT)

## Rollout

- Feature flag `VITE_AUTH_ENABLED` gates the entire auth UI
- Flag off → `session.current` always `null`; app behaves exactly as today (no regression)
- Flag on → guest-mode + sign-in wall + sync engine active
- Internal testing → 10-user beta → general availability

## Out of scope for v1

- Email + password / magic link (only OAuth at launch)
- Annual billing plan (monthly only)
- Multi-account switching on same device
- Audit log UI (seams ready — table deferred)
- Team / organization accounts
- Social features (share chat, public presets)
- Mobile native apps

## Open questions for implementation

None. All architectural decisions locked.
