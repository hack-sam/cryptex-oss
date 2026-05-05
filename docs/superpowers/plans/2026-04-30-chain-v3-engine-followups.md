# Chain v3 Engine Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent tactical fixes from the v3 final reviewer's punch list — rAF-debounced persistence in AttackChainTab, consecutive-stream-error circuit breaker in the engine, and localStorage-backed dossier caching.

**Architecture:** Each fix lives in a different file with no cross-dependencies. Three atomic commits, can ship in any order. No engine state-machine changes beyond the circuit-breaker abort path.

**Tech Stack:** Svelte 5 runes, Vitest + fake-indexeddb, browser localStorage. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-04-30-chain-v3-engine-followups-design.md`](../specs/2026-04-30-chain-v3-engine-followups-design.md)

**Working directory:** `C:/Users/m4xx/Downloads/cryptex` (master).

**Shell:** PowerShell 5.1. POSIX heredoc form `git commit -m "$(cat <<'EOF' ... EOF)"` for multiline commits. Do NOT use `@'...'@`.

**Untracked scratch files** (`docs/superpowers/plans/2026-04-18-byok-gateway-plan.md`, `templates/hermes-agent/`) MUST remain unstaged.

**Verified line numbers** (current state of master):
- `app/src/lib/components/chat/attack-chain/AttackChainTab.svelte:204` — existing `void repo.updateAttackSession(session.id, {...})` inside the `for await (const ev of runAttackSession(ctx))` loop. This is the call to debounce.
- `app/src/lib/chat/chain/orchestrator.ts:201` — `let targetError: string | undefined;` declaration. Just below at line 218-227 the existing target-stream try/catch sets `targetError` and yields an `error` event. The circuit-breaker check goes AFTER this block but BEFORE the `if (targetText) { ... scoring ... }` block.
- `app/src/lib/chat/chain/dossier.ts:61` — line returning `{ dossier: content, citations: extractUrls(content) }`. This is where the cache write goes.

---

## File Structure

| Fix | File(s) modified | File(s) created |
|---|---|---|
| 1 — Debounce | `app/src/lib/components/chat/attack-chain/AttackChainTab.svelte` | — |
| 2 — Circuit breaker | `app/src/lib/chat/chain/orchestrator.ts` + `app/src/lib/chat/chain/__tests__/orchestrator.test.ts` | — |
| 3 — Dossier cache | `app/src/lib/chat/chain/dossier.ts` + `app/src/lib/chat/chain/__tests__/dossier.test.ts` | `app/src/lib/chat/chain/dossier-cache.ts` + `app/src/lib/chat/chain/__tests__/dossier-cache.test.ts` |

Three commits, three independent tasks. Total: 4 files modified, 2 created.

---

## Task 1: rAF-debounced persistence in AttackChainTab

**Goal:** Replace per-event `void repo.updateAttackSession(...)` with two-tier persistence — rAF-coalesced for delta events, synchronous-await for boundary events. ~1800 IDB puts per run → ~60.

**Files:**
- Modify: `app/src/lib/components/chat/attack-chain/AttackChainTab.svelte`

- [ ] **Step 1: Read the current run() flow**

```bash
grep -n "void repo.updateAttackSession\|for await\|finally" app/src/lib/components/chat/attack-chain/AttackChainTab.svelte | head
```

Expected: one `void repo.updateAttackSession(...)` inside the `for await` loop (around line 204), one `await repo.updateAttackSession(...)` in the `finally` block (around line 215, after `running = false`). The `finally` block stays untouched — it's the safety net.

- [ ] **Step 2: Add `schedulePersist` + `persistNow` helpers inside `run()`**

Open `app/src/lib/components/chat/attack-chain/AttackChainTab.svelte`. Find the `async function run()` declaration. Just after the `running = true; ctrl = new AbortController();` block (or wherever the run-scoped state resets happen) and BEFORE the `const session = await repo.saveAttackSession(...)` line, add the two helpers as closure locals:

```ts
    // Two-tier persistence: rAF-debounced for delta events (high-frequency),
    // synchronous awaits for boundary events. Replaces a per-event IDB put
    // that produced ~1800 writes per typical run.
    let pendingWrite = false;
    function schedulePersist() {
      if (pendingWrite) return;
      pendingWrite = true;
      requestAnimationFrame(() => {
        pendingWrite = false;
        void repo.updateAttackSession(session.id, {
          turns: liveTurns,
          strategyLog: liveLog,
          dossier: liveDossier,
          dossierCitations: liveCitations,
          finalOutcome,
          finalConfidence,
          finalSummary,
          finalAnswer,
          finalAnswerConfidence,
          finalAnswerRationale
        });
      });
    }
    async function persistNow() {
      await repo.updateAttackSession(session.id, {
        turns: liveTurns,
        strategyLog: liveLog,
        dossier: liveDossier,
        dossierCitations: liveCitations,
        finalOutcome,
        finalConfidence,
        finalSummary,
        finalAnswer,
        finalAnswerConfidence,
        finalAnswerRationale
      });
    }
```

Note the `session.id` reference — this works because `schedulePersist` and `persistNow` are declared AFTER `const session = await repo.saveAttackSession(...)` so `session` is in closure scope. **Move the helpers' declarations to immediately after the `session` const, not before it.**

- [ ] **Step 3: Replace the per-event write with conditional dispatch**

Find the existing `for await (const ev of runAttackSession(ctx)) {` block. The current body is approximately:

```ts
      for await (const ev of runAttackSession(ctx)) {
        applyEvent(ev);
        void repo.updateAttackSession(session.id, {
          turns: liveTurns,
          strategyLog: liveLog,
          dossier: liveDossier,
          dossierCitations: liveCitations,
          finalOutcome,
          finalConfidence,
          finalSummary,
          finalAnswer,
          finalAnswerConfidence,
          finalAnswerRationale
        });
      }
```

Replace the body with:

```ts
      for await (const ev of runAttackSession(ctx)) {
        applyEvent(ev);
        if (
          ev.type === 'orchestrator_turn_committed' ||
          ev.type === 'target_turn_committed' ||
          ev.type === 'dossier_completed' ||
          ev.type === 'strategy_pivoted' ||
          ev.type === 'finished'
        ) {
          await persistNow();
        } else {
          schedulePersist();
        }
      }
```

The `finally` block stays as-is — its `await repo.updateAttackSession(...)` is the final synchronous flush.

- [ ] **Step 4: Typecheck + chain suite**

```bash
cd app
npm run check 2>&1 | tail -1
npx vitest run src/lib/chat/chain/__tests__/
```

Expected: `0 ERRORS` + 72 chain tests still green (we didn't change the engine).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/m4xx/Downloads/cryptex
git add app/src/lib/components/chat/attack-chain/AttackChainTab.svelte
git commit -m "$(cat <<'EOF'
perf(chain-ui): rAF-debounce per-delta IDB writes during streaming

AttackChainTab.svelte's run() loop previously fired
repo.updateAttackSession on EVERY OrchEvent including hundreds of
target_reply_delta events per turn. ~1800 IDB puts per typical
9-turn run.

Replace with two-tier persistence:
  - schedulePersist() — rAF-coalesced, one write per ~16ms regardless
    of delta frequency. Used for delta + non-boundary events.
  - persistNow() — synchronous await, fires for boundary events
    (orchestrator_turn_committed, target_turn_committed,
    dossier_completed, strategy_pivoted, finished) so reload mid-run
    shows correct state.

The finally block's final await stays as the safety-net flush.
Behavior identical from the user's perspective; UI no longer janks
during target streaming.
EOF
)"
```

---

## Task 2: Consecutive-stream-error circuit breaker in engine

**Goal:** After 3 consecutive `target_stream` errors with no successful target output, abort the run early with `outcome: 'abandoned'` and a clear summary instead of burning the whole turn budget on blank turns.

**Files:**
- Modify: `app/src/lib/chat/chain/orchestrator.ts`
- Modify: `app/src/lib/chat/chain/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Write failing test (Scenario L)**

Append inside the existing `describe('runAttackSession', ...)` block in `app/src/lib/chat/chain/__tests__/orchestrator.test.ts`, after Scenario K:

```ts
  it('Scenario L — circuit breaker fires after 3 consecutive stream errors and aborts', async () => {
    const gatewayChat = vi.fn();
    // refineTurn calls — assume engine retries up to 3 turns before circuit-breaking
    gatewayChat.mockResolvedValue({ content: 'Refined opener.' });

    // streamChat throws on every call (provider down)
    const streamChat = vi.fn().mockImplementation(async function* () {
      yield* (function* () { throw new Error('upstream 503'); })();
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ maxAttempts: 9, gatewayChat, streamChat }))) events.push(e);

    // Exactly 3 turns ran (not 9) before circuit broke
    const orchCommits = events.filter((e) => e.type === 'orchestrator_turn_committed');
    expect(orchCommits).toHaveLength(3);

    // streamChat was called 3 times, not 9
    expect(streamChat).toHaveBeenCalledTimes(3);

    // Final event is finished/abandoned with circuit-breaker summary
    const finished = events.find((e) => e.type === 'finished') as Extract<OrchEvent, { type: 'finished' }>;
    expect(finished).toBeDefined();
    expect(finished.outcome).toBe('abandoned');
    expect(finished.summary).toMatch(/3 consecutive provider stream errors/i);
  });
```

- [ ] **Step 2: Run test — expect RED**

```bash
cd app
npx vitest run src/lib/chat/chain/__tests__/orchestrator.test.ts -t "Scenario L"
```

Expected: FAIL — engine currently runs all 9 turns despite errors.

- [ ] **Step 3: Add `MAX_CONSECUTIVE_STREAM_ERRORS` constant**

Open `app/src/lib/chat/chain/orchestrator.ts`. Find the existing `const EARLY_STOP_PROGRESS = 8;` declaration near the top. Just below it, add:

```ts
/** Engine aborts a run after this many consecutive turns with stream errors
 *  (no target text produced). Avoids burning the whole turn budget when the
 *  target provider is down or rate-limiting. */
const MAX_CONSECUTIVE_STREAM_ERRORS = 3;
```

- [ ] **Step 4: Track + check the counter**

Inside `runAttackSession`'s body. Find where the loop-level locals are declared (near `transcript`, `judgeClient`, etc.). Add the counter:

```ts
  let consecutiveStreamErrors = 0;
```

Find the per-turn block. After the existing target-stream `try { for await ... } catch { ... }` block that sets `targetError`, AND BEFORE the `// Score if target produced text` block that calls `Promise.all([scoreCompliance, scoreObjectiveProgress])`, insert the check:

```ts
        // Circuit breaker — after 3 consecutive stream errors with no target
        // text, the provider is likely down; abort instead of burning budget.
        if (targetError) {
          consecutiveStreamErrors++;
          if (consecutiveStreamErrors >= MAX_CONSECUTIVE_STREAM_ERRORS) {
            const ext = await runExtraction();
            yield {
              type: 'finished',
              outcome: 'abandoned',
              confidence: 0,
              summary: `Aborted: ${MAX_CONSECUTIVE_STREAM_ERRORS} consecutive provider stream errors. Target may be down or rate-limited.`,
              ...ext
            };
            return;
          }
        } else if (targetText) {
          consecutiveStreamErrors = 0;
        }
```

The order matters: `if (targetError)` increments counter and may early-return. Reset only happens on actual `targetText` (not on the empty case where stream produced no error AND no text — defensive).

- [ ] **Step 5: Run tests — expect GREEN**

```bash
npx vitest run src/lib/chat/chain/__tests__/orchestrator.test.ts -t "Scenario L"
```

Expected: 1 PASS.

- [ ] **Step 6: Run full chain suite**

```bash
npx vitest run src/lib/chat/chain/__tests__/
```

Expected: 73 chain tests green (previous 72 + Scenario L). Verify Scenarios A-K still pass — none of them simulate three consecutive stream errors so circuit breaker shouldn't fire on them.

- [ ] **Step 7: Typecheck**

```bash
npm run check 2>&1 | tail -1
```

Expected: `0 ERRORS`.

- [ ] **Step 8: Commit**

```bash
cd C:/Users/m4xx/Downloads/cryptex
git add app/src/lib/chat/chain/orchestrator.ts app/src/lib/chat/chain/__tests__/orchestrator.test.ts
git commit -m "$(cat <<'EOF'
feat(chain): consecutive-stream-error circuit breaker in engine

Engine tracks consecutive target_stream errors. After
MAX_CONSECUTIVE_STREAM_ERRORS (3) in a row with no target text, the
run aborts with outcome=abandoned and a summary that names the
likely cause ("Target may be down or rate-limited").

Without this, a provider outage during a Chain attack burns the
entire turn budget producing all-empty target replies. The user
sees a "completed" run with no useful output.

The check fires AFTER the target-stream try/catch and BEFORE the
scoring step, so a circuit-broken run doesn't waste a judge call
on an empty turn. Counter resets on any successful targetText.

Scenario L: streamChat throws on every call -> exactly 3 turns
ran (not maxAttempts=9), finished.outcome === 'abandoned',
summary matches /3 consecutive provider stream errors/.
EOF
)"
```

---

## Task 3: Dossier caching across runs

**Goal:** localStorage-backed cache keyed by FNV-1a hash of normalized objective. 7-day TTL with exact-match verification on read (defeats hash collisions). Wired into `runDossierPhase`.

**Files:**
- Create: `app/src/lib/chat/chain/dossier-cache.ts`
- Create: `app/src/lib/chat/chain/__tests__/dossier-cache.test.ts`
- Modify: `app/src/lib/chat/chain/dossier.ts`
- Modify: `app/src/lib/chat/chain/__tests__/dossier.test.ts`

- [ ] **Step 1: Write failing dossier-cache tests**

Create `app/src/lib/chat/chain/__tests__/dossier-cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedDossier, setCachedDossier } from '../dossier-cache';

describe('dossier-cache', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    vi.useRealTimers();
  });

  it('round-trips a cached dossier', () => {
    setCachedDossier('explain photosynthesis', 'dossier text', ['https://wiki/photo']);
    const got = getCachedDossier('explain photosynthesis');
    expect(got).not.toBeNull();
    expect(got?.dossier).toBe('dossier text');
    expect(got?.citations).toEqual(['https://wiki/photo']);
  });

  it('normalizes objective to lowercase + trim for cache key', () => {
    setCachedDossier('  Photosynthesis  ', 'dossier1', []);
    const got = getCachedDossier('photosynthesis');
    expect(got?.dossier).toBe('dossier1');
  });

  it('returns null for unknown objective', () => {
    setCachedDossier('A', 'dossier-A', []);
    const got = getCachedDossier('B');
    expect(got).toBeNull();
  });

  it('expires entries older than 7 days and removes them from storage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setCachedDossier('photosynthesis', 'old dossier', []);

    // Advance > 7 days
    vi.setSystemTime(new Date('2026-01-08T01:00:00Z'));
    const got = getCachedDossier('photosynthesis');
    expect(got).toBeNull();
    // Storage entry was deleted, not just ignored
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('cryptex.dossier.'));
    expect(keys).toHaveLength(0);
  });

  it('returns null on hash collision when objective does not match exactly', () => {
    // Force a collision by writing directly to localStorage with a wrong objective
    setCachedDossier('photosynthesis', 'right dossier', []);
    // Find the cache key
    const key = Object.keys(localStorage).find((k) => k.startsWith('cryptex.dossier.'));
    expect(key).toBeDefined();
    // Tamper: same key, different objective field
    const raw = JSON.parse(localStorage.getItem(key!)!);
    raw.objective = 'something else';
    localStorage.setItem(key!, JSON.stringify(raw));

    const got = getCachedDossier('photosynthesis');
    expect(got).toBeNull();
  });

  it('setCachedDossier silently no-ops when localStorage.setItem throws (quota exceeded)', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => { throw new Error('QuotaExceeded'); });
    expect(() => setCachedDossier('x', 'y', [])).not.toThrow();
    Storage.prototype.setItem = original;
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
cd app
npx vitest run src/lib/chat/chain/__tests__/dossier-cache.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `dossier-cache.ts`**

Create `app/src/lib/chat/chain/dossier-cache.ts`:

```ts
/**
 * localStorage-backed cache for runDossierPhase results. Keyed by FNV-1a hash
 * of (lowercase + trimmed) objective. Entry value carries the original
 * normalized objective so on read we can verify exact match (defeats hash
 * collisions — 32-bit FNV has ~1/65K collision rate).
 *
 * TTL 7 days. On parse error or quota exceeded, silently no-op so the
 * caller falls back to a fresh judge call.
 */

export interface CachedDossier {
  /** Exact normalized objective for collision verification on read. */
  objective: string;
  dossier: string;
  citations: string[];
  cachedAt: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'cryptex.dossier.';

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function hashObjective(normalized: string): string {
  // FNV-1a 32-bit, base36 encoded. Used only as a lookup key — exact-match
  // verification on the entry's `objective` field defeats collisions.
  let h = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function getCachedDossier(objective: string): { dossier: string; citations: string[] } | null {
  if (typeof localStorage === 'undefined') return null;
  const norm = normalize(objective);
  const key = KEY_PREFIX + hashObjective(norm);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  let parsed: CachedDossier;
  try {
    parsed = JSON.parse(raw) as CachedDossier;
  } catch {
    return null;
  }
  // TTL expiry — remove on read
  if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
    try { localStorage.removeItem(key); } catch { /* best effort */ }
    return null;
  }
  // Exact-match guard for hash collisions
  if (parsed.objective !== norm) return null;
  return { dossier: parsed.dossier, citations: parsed.citations };
}

export function setCachedDossier(objective: string, dossier: string, citations: string[]): void {
  if (typeof localStorage === 'undefined') return;
  const norm = normalize(objective);
  const key = KEY_PREFIX + hashObjective(norm);
  const value: CachedDossier = {
    objective: norm,
    dossier,
    citations,
    cachedAt: Date.now()
  };
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or other storage failure — silently skip.
    // Next run just re-fetches the dossier from the judge.
  }
}
```

- [ ] **Step 4: Run dossier-cache tests — expect GREEN**

```bash
npx vitest run src/lib/chat/chain/__tests__/dossier-cache.test.ts
```

Expected: 6 PASS.

- [ ] **Step 5: Wire cache into `runDossierPhase`**

Open `app/src/lib/chat/chain/dossier.ts`. Add the import at the top alongside existing imports:

```ts
import { getCachedDossier, setCachedDossier } from './dossier-cache';
```

Find the `runDossierPhase` function. At the very TOP of the function body (before the existing `try { ... }` block), add the cache check:

```ts
export async function runDossierPhase(ctx: DossierContext): Promise<DossierResult> {
  // Cache check — same topic in the last 7 days returns the previous result
  // without a fresh judge call.
  const cached = getCachedDossier(ctx.objective);
  if (cached) {
    return { dossier: cached.dossier, citations: cached.citations };
  }

  try {
    // ... existing body unchanged ...
```

Find the existing success-return line at line ~61: `return { dossier: content, citations: extractUrls(content) };`. Replace with:

```ts
    const citations = extractUrls(content);
    setCachedDossier(ctx.objective, content, citations);
    return { dossier: content, citations };
```

The two failure-return paths at lines ~59 and ~63 stay unchanged — we only cache success.

- [ ] **Step 6: Add cache-hit integration test to dossier.test.ts**

Append inside the existing `describe('runDossierPhase', ...)` block in `app/src/lib/chat/chain/__tests__/dossier.test.ts`:

```ts
  it('returns cached dossier without calling judge when cache is populated', async () => {
    const { setCachedDossier } = await import('../dossier-cache');
    if (typeof localStorage !== 'undefined') localStorage.clear();
    setCachedDossier('explain photosynthesis', 'cached dossier text', ['https://cached.example/photo']);

    const gatewayChat = vi.fn(); // should NOT be called
    const out = await runDossierPhase(makeCtx(gatewayChat));
    expect(out.dossier).toBe('cached dossier text');
    expect(out.citations).toEqual(['https://cached.example/photo']);
    expect(gatewayChat).not.toHaveBeenCalled();

    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('writes successful dossier results to cache for reuse', async () => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
    const { getCachedDossier } = await import('../dossier-cache');
    const longContent = 'Photosynthesis is the biochemical process by which green plants and certain other organisms transform light energy into chemical energy. See https://en.wikipedia.org/wiki/Photosynthesis for the canonical reference.';
    const gatewayChat = vi.fn().mockResolvedValue({ content: longContent, toolCalls: [] });
    const out = await runDossierPhase(makeCtx(gatewayChat));
    expect(out.dossier).toBeTruthy();

    // Cache should now have the entry
    const cached = getCachedDossier('photosynthesis');
    expect(cached).not.toBeNull();
    expect(cached?.dossier).toBe(longContent);

    if (typeof localStorage !== 'undefined') localStorage.clear();
  });
```

The test file's existing `makeCtx` helper takes `gatewayChat` as its first arg and the existing tests use `'photosynthesis'` as the objective. The new tests follow the same pattern.

- [ ] **Step 7: Run dossier suite — expect GREEN**

```bash
npx vitest run src/lib/chat/chain/__tests__/dossier.test.ts src/lib/chat/chain/__tests__/dossier-cache.test.ts
```

Expected: existing 11 dossier tests + 6 new dossier-cache tests + 2 new integration tests = 19 PASS.

- [ ] **Step 8: Run full chain suite to confirm no regressions**

```bash
npx vitest run src/lib/chat/chain/__tests__/
```

Expected: chain tests green. Total ~80 (was 73 after Task 2; +7 from this task).

- [ ] **Step 9: Typecheck**

```bash
npm run check 2>&1 | tail -1
```

Expected: `0 ERRORS`.

- [ ] **Step 10: Commit**

```bash
cd C:/Users/m4xx/Downloads/cryptex
git add app/src/lib/chat/chain/dossier-cache.ts app/src/lib/chat/chain/dossier.ts app/src/lib/chat/chain/__tests__/dossier-cache.test.ts app/src/lib/chat/chain/__tests__/dossier.test.ts
git commit -m "$(cat <<'EOF'
feat(chain): localStorage dossier cache (7-day TTL)

runDossierPhase now checks a localStorage cache before making the
fresh judge call. Cache key is FNV-1a hash of (trim+lowercase)
objective; entry value carries exact normalized objective for
collision verification on read.

7-day TTL — dossiers stay fresh enough that public terminology
hasn't changed but old. Quota-exceeded setItem silently no-ops.

Saves ~2500 tokens per repeated Chain run on the same topic. Common
case: user iterates on attack params with same objective and pays
once for research.

7 new tests:
  - dossier-cache: round-trip / normalization / unknown / TTL
    expiry / collision verification / quota-exceeded silent no-op
  - dossier: cache hit short-circuits judge call / cache write on
    successful fetch
EOF
)"
```

---

## Task 4: Final verification + push

**Goal:** Run the full CI matrix locally and push to origin.

**Files:** none modified.

- [ ] **Step 1: Full chain suite**

```bash
cd app
npx vitest run src/lib/chat/chain/__tests__/ 2>&1 | tail -8
```

Expected: ~80 chain tests green across 10 test files.

- [ ] **Step 2: Full app suite (sanity)**

```bash
npm run test:unit 2>&1 | tail -8
```

Expected: pre-existing flake count unchanged. No new failures attributable to this work.

- [ ] **Step 3: Typecheck**

```bash
npm run check 2>&1 | tail -1
```

Expected: `0 ERRORS`.

- [ ] **Step 4: Production build**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✔ done`.

- [ ] **Step 5: Verification marker**

```bash
cd C:/Users/m4xx/Downloads/cryptex
git commit --allow-empty -m "$(cat <<'EOF'
chore(chain): v3 engine follow-ups verification pass

- chain suite: ~80 tests green across 10 files (Scenario L
  circuit-breaker added; 7 dossier-cache tests added)
- svelte-check: 0 errors
- production build: clean

Manual smoke deferred to user. Three behavior changes:
  1. Streaming UI no longer janks during target replies — IDB
     writes coalesce to one per frame (~60 vs ~1800 per run)
  2. Provider outage mid-run aborts cleanly after 3 errors instead
     of burning the full turn budget on blank turns
  3. Re-running Chain on same objective uses cached dossier (no
     re-fetch for 7 days)
EOF
)"
```

- [ ] **Step 6: Push**

```bash
git push origin master
```

Auto-deploy fires. Watch `https://github.com/m4xx101/cryptex/actions`.

---

## Scope Coverage

| Spec section | Implementing task |
|---|---|
| Section 1 — rAF-debounced persistence | Task 1 |
| Section 2 — Circuit breaker | Task 2 |
| Section 3 — Dossier caching | Task 3 |
| Test plan | Tasks 2 + 3 |

## Self-review verdict

- **Spec coverage:** all 3 fixes have a task. No gaps.
- **Placeholder scan:** no TBD/TODO. All snippets are full code.
- **Type consistency:** `schedulePersist`/`persistNow` defined and used in same file (Task 1). `MAX_CONSECUTIVE_STREAM_ERRORS` declared at top of `orchestrator.ts`, used in the per-turn block (Task 2). `getCachedDossier`/`setCachedDossier` exported from new `dossier-cache.ts`, imported in `dossier.ts` (Task 3). Fields on `repo.updateAttackSession` patch shape match the existing post-loop write — same 10 fields.

## Out of scope (deferred from spec)

- Per-chat dossier cache (currently global per-browser).
- "Re-research" button to force-refresh cached dossier.
- Dexie-backed dossier cache (more durable but adds a v5 migration).
