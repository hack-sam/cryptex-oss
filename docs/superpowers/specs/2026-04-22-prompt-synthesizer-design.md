# Prompt Synthesizer — Design Spec

**Date:** 2026-04-22
**Subsystem:** B (second of five in the ULTRA-GODMODE rewire; see `GODMODE-rewire.md` for the source blueprint)
**Status:** Design — awaiting user review before plan
**Authors:** brainstormed with superpowers:brainstorming

---

## 1. Purpose

Turn arbitrary user-pasted prompts into entries in the `custom_techniques` table, so Subsystem A's `allCombinations()` picks them up as new DNA axes for candidate ranking.

Per authenticated paid request the synthesizer:

1. Validates the request and detects "shibboleth" phrases (the trigger-pattern strings commit `033328c` established as jailbreak-fingerprinting on 2026 SOTA models).
2. Calls Sonnet 4.6 with a structured-output analyzer prompt — one of two variants depending on the `decompose` flag.
3. Auto-rewrites shibboleth phrases into Cherny-minimal equivalents if the analyzer detects they're load-bearing; preserves the original excerpt in an audit field.
4. Writes one `custom_techniques` row (composite mode) or 1..5 rows (decompose mode) in a single transaction.
5. Returns the parsed `AnalysisPayload` plus inserted row IDs for the client to render.

This design covers **Subsystem B phase 1 only**. Variator (B-phase-2), dataset-export pipeline (B-phase-3), and the rich library UI (Subsystem D) are out of scope except where B defines contracts they consume.

## 2. Non-goals

- **No variant generation** in phase 1. One user submit → one analyzer call → one-or-many persisted rows. No LLM-driven "give me siblings of this prompt" capability yet.
- **No prompt-level dataset pipeline.** Attempt-level memory already exists (A's `attempt_memory_private/global`). B-phase-3 adds a separate prompt-level log; phase-1 skips it.
- **No rich library UI.** Subsystem D ships the browse/rename/delete/toggle-public surfaces. Phase-1 ships a minimal "Save as technique" collapsible inline in the Godmode drawer.
- **No SSE streaming.** The synthesizer is single-round: one HTTP POST → one JSON response. Unlike A's godmode-engine (which streams event-by-event), B returns a completed `AnalysisPayload`.
- **No changes to Subsystem A's engine, dispatcher, ranker, memory, or scoring code.** B only populates `custom_techniques` rows and triggers a registry refresh. A picks them up unchanged.
- **No public-toggle UI in phase 1.** `custom_techniques.is_public` defaults to `false`; the user has no UI to flip it. D adds that later.

## 3. Design decisions (locked during brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | Phase-1 scope = **analyze + store only**. No variator, no prompt-log. | Variants depend on proven analyzer output shape first; premature co-design risks baked-in assumptions. Dataset logging is phase-3. |
| D2 | Execution is **server-only** in a new Supabase edge function `prompt-synthesizer`. Provider keys vaulted in env (`ANTHROPIC_API_KEY_N`). Paid-auth only via existing `requirePaid`. | Inherits A's topology. `custom_techniques.owner_user_id` requires auth context; server-vaulted Sonnet calls match the "secure API-style scalable service" brief. |
| D3 | Granularity = **1→1 composite by default, optional `decompose` flag** that splits the prompt into 1..5 per-DNA-axis rows. | Matches how most users paste whole-piece creative prompts (default simple) while giving power users the blueprint's "composable grammar" (decompose mode). |
| D4 | Analysis output is **rich structured JSON**, stored in a new `analysis JSONB NULL` column on `custom_techniques`. | User's brief explicitly says "understand + store + log for future use" — minimal metadata loses that value; response-only analysis forces re-compute for downstream consumers. |
| D5 | Shibboleth handling = **analyzer auto-rewrites** (mode B from Q4). The rewritten text is persisted; the original excerpt + matched phrases are preserved in `analysis.shibboleth`. | Matches security-researcher audience who paste blueprint-derived prompts; auto-rewrite preserves creative intent without hard-blocking, and the audit trail keeps transparency. |
| D6 | Analyzer model = **Sonnet 4.6, hardcoded**. | One call per submit (low volume vs A's judge). Quality matters for "why it works" narrative + reliable rewrite + reliable JSON output. Haiku is borderline on all three; Opus is premature expense. User-configurable deferred. |
| D7 | UI surface = **inline collapsible section in Godmode drawer**, not a new drawer or new route. | Avoids shipping a second dev-grade drawer (F1.3 criticism still open). Natural UX continuum: user writes a prompt in Godmode → runs it → saves it. D ships the rich library later. |

## 4. Architecture

```
Browser                                   Supabase Edge Function                     Postgres
───────                                   ──────────────────────                     ────────
Godmode drawer                            prompt-synthesizer/
  ├─ task textarea                         ├─ index.ts  (HTTP + auth + validate)     custom_techniques
  ├─ K slider                              ├─ synthesizer-core.ts                      ← populated (new `analysis` col)
  ├─ Run godmode                           ├─ analyzer.ts  (Sonnet prompt builder)
  └─ Save section (new)                    ├─ shibboleth.ts                          (A's attempt_memory_* untouched)
      ├─ name field                        ├─ writer.ts
      ├─ decompose? ☐          POST ──►    └─ _shared/analyzer-client.ts
      └─ Save                  ◄── JSON ── (fetch Sonnet 4.6 via anthropic
                                            Messages API, raw fetch)
```

## 5. Module responsibilities

### Server side — `supabase/functions/prompt-synthesizer/`

| Module | Exports | Responsibilities |
|---|---|---|
| `index.ts` | HTTP handler | Auth (`requirePaid`), rate-limit (`rateLimit('synth:${userId}', 10, 60_000)`), parse + validate body (prompt 1..16_000 chars, name 1..128 chars, decompose boolean), resolve Sonnet API key from env pool, invoke `synthesizer-core.run()`, return JSON response. Single-round — no SSE. |
| `synthesizer-core.ts` | `run({prompt, name, decompose, userId, analyzerClient, db}) → Promise<SynthesizeResult>` | Pure orchestrator. Steps: detect shibboleths → call analyzer with mode → choose final content (rewrite if analyzer produced one) → call writer → return `{rowIds, analysis}`. Takes analyzer + db as DI ports for test isolation. |
| `analyzer.ts` | `analyze(client, args) → Promise<AnalysisResult>` | Builds the Sonnet system + user prompt (two variants: composite mode vs decompose mode). Sends the Sonnet call. Parses JSON response with graceful fallback (malformed → composite fallback with `parse_error` in analysis + `confidence: 'low'`). |
| `shibboleth.ts` | `detectShibboleths(text) → string[]`, `SHIBBOLETH_PATTERNS: readonly RegExp[]` | Imports `SHIBBOLETH_PATTERNS` from `app-chat/attack-chain-refusal.ts` (extended in this phase) and runs each pattern against the input text, returning matched substrings (first 60 chars each). |
| `writer.ts` | `insertComposite(...)`, `insertMany(...)` | Persists to `custom_techniques` via Supabase service-role client. Both methods use a single transaction. Enforces `UNIQUE (owner_user_id, name)` via DB constraint — duplicate raises `duplicate_name` which index.ts surfaces as 400. |
| `_shared/analyzer-client.ts` | `makeAnalyzerClient(apiKey) → AnalyzerClient` | Thin Sonnet 4.6 wrapper matching the `JudgeClient` shape from A's `__shared/judge.ts`. Same `anthropicComplete` function inlined (shared patterns won't be extracted until F2). |

### Shared with the SvelteKit app (imported, not duplicated)

| Path | Change |
|---|---|
| `app/src/lib/chat/attack-chain-refusal.ts` | **Extended.** Add `export const SHIBBOLETH_PATTERNS: readonly RegExp[] = [...]` — the 5 core regex patterns from commit `033328c` (subset of the full `PATTERNS` array, scoped to known fingerprintable phrases, not the broader refusal-detection set). |
| `app/src/lib/chat/techniques/registry.ts` | **Extended.** Add `refreshCustom(): Promise<void>` that re-queries `custom_techniques WHERE owner_user_id = currentUser OR is_public = true` via the browser Supabase client and merges into the cached `_all` list. Called via a `registry:refresh-custom` custom event after a successful save. |

### Browser side (`app/src/lib/chat/godmode/`)

| Path | Change |
|---|---|
| `panel.svelte` | **Extended.** New collapsible section below the event log, titled "Save as custom technique". Fields: `name` (text input), `decompose` (checkbox, default off), primary action `Save`. On submit: POST to `/functions/v1/prompt-synthesizer` via `synthesizer-client.ts::saveAsTechnique()`. Response → render the analysis block inline (why-it-works, strategy tags, shibboleth notification if present, row IDs). Dispatch `registry:refresh-custom` event to update the engine's registry cache. |
| `synthesizer-client.ts` | **New, ~40 lines.** `saveAsTechnique({prompt, name, decompose, jwt, signal}) → Promise<SynthesizeResult>`. Regular `fetch` with `Authorization: Bearer ${jwt}` and `Content-Type: application/json`. Non-2xx → throw `Error('synth <status>: <body>')`. |
| `types.ts` | **Extended.** Add `SynthesizeResult`, `AnalysisPayload`, `DetectedAxes` types — mirror of server-side shapes. Manual-sync discipline until F2 unifies them. |
| `__tests__/synthesizer-client.test.ts` | **New.** Mocked-fetch tests: happy path, 400 validation error, 429 rate limit, malformed response. |

### New migration

`supabase/migrations/20260422_000002_custom_techniques_analysis.sql`:

```sql
ALTER TABLE custom_techniques ADD COLUMN analysis JSONB NULL;
COMMENT ON COLUMN custom_techniques.analysis IS
  'Populated by prompt-synthesizer (Subsystem B). Contains why_it_works, detected_axes, strategy_tags, shibboleth audit. Nullable for rows inserted outside the synthesizer flow.';

-- Name uniqueness per owner — prevents accidental duplicates from the save form.
ALTER TABLE custom_techniques
  ADD CONSTRAINT custom_techniques_owner_name_unique UNIQUE (owner_user_id, name);

-- RLS: owner can read/write their own rows; public rows readable by everyone.
ALTER TABLE custom_techniques ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_techniques_read ON custom_techniques
  FOR SELECT USING (owner_user_id = auth.uid() OR is_public = true);

CREATE POLICY custom_techniques_insert ON custom_techniques
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY custom_techniques_update ON custom_techniques
  FOR UPDATE USING (owner_user_id = auth.uid());

CREATE POLICY custom_techniques_delete ON custom_techniques
  FOR DELETE USING (owner_user_id = auth.uid());
```

## 6. Data contract

### 6.1 HTTP API

```
POST /functions/v1/prompt-synthesizer
Authorization: Bearer <supabase_jwt>
Content-Type: application/json

Request body:
{
  "prompt": string,        // 1..16000 chars — the user's pasted prompt
  "name":   string,        // 1..128 chars — library display name
  "decompose": boolean     // optional, default false
}

Success response (200):
{
  "rowIds": string[],           // 1 for composite, 1..5 for decompose
  "analysis": AnalysisPayload,
  "fallback": string | null     // e.g. 'parse_error', 'decompose_empty_splits' — null on happy path
}

Error responses:
400 — { "code": "invalid_body" | "duplicate_name" | "prompt_too_long" | ..., "message": string }
401 | 403 — bare text body (unchanged from _shared/auth.ts)
429 — "Too many requests"
503 — { "code": "misconfigured" | "analyzer_unavailable", "message": string }
500 — { "code": "persist_failed" | "synth_crash", "message": string }
504 — { "code": "analyzer_timeout", "message": string }
```

### 6.2 `AnalysisPayload` JSON shape

```ts
interface AnalysisPayload {
  v: 1;                                          // schema version — increment on breaking changes
  mode: 'composite' | 'decomposed';              // which analyzer path produced this
  why_it_works: string;                          // ≤ 800 chars — plain-language explanation
  detected_axes: DetectedAxes;
  strategy_tags: string[];                       // 1..6 short tags
  confidence: 'high' | 'medium' | 'low';
  shibboleth?: {                                 // present only if shibboleths detected
    detected: string[];                          // matched substrings, first 60 chars each
    rewrote: boolean;                            // true = stored prompt is rewritten; false = kept original
    original_excerpt: string;                    // ≤ 400 chars of the original including matches
  };
  decompose_splits?: {                           // present only in mode: 'decomposed'
    category: 'mutate' | 'classifier' | 'prefill' | 'composite' | 'mode';
    row_id: string;
    content_preview: string;                     // ≤ 160 chars
    rationale: string;                           // ≤ 200 chars
  }[];
  parse_error?: string;                          // present only if analyzer JSON was malformed
  derived_from?: string;                         // reserved for B-phase-2 variator lineage
}

interface DetectedAxes {
  mutator?:    'strong' | 'weak';  // rewrites user input (per-turn rewriter, implicit rewrite)
  classifier?: 'strong' | 'weak';  // framing / role / persona declared in system
  prefill?:    'strong' | 'weak';  // fake prior turn or assistant-agreement primer
  wrapper?:    'strong' | 'weak';  // output formatting / encoding / smuggling
  mode?:       'strong' | 'weak';  // creative / intelligent / adaptive tone shift
}
```

`strategy_tags` is a free-form string array but the analyzer prompt enumerates canonical examples: `'persona-shift'`, `'authority-claim'`, `'scenario-framing'`, `'prefill-agreement'`, `'encoding-bypass'`, `'academic-framing'`, `'roleplay'`, `'grandparent'`, `'developer-override'`, `'orthogonal-objective'`, `'base64-smuggle'`. The analyzer picks 1–6 that best describe the prompt; novel tags allowed.

### 6.3 Analyzer prompt modes

**Composite mode** (`decompose: false`):

System:
```
You are a prompt analyzer. Output strict JSON matching the AnalysisPayload schema.
Never output prose outside the JSON.
```

User (template):
```
Analyze this user-provided prompt. Determine:
1. Why it works — what safety-circumvention mechanism does it deploy?
2. Which DNA axes does it touch (mutator / classifier / prefill / wrapper / mode) and how strongly?
3. What strategy tags describe its approach? Pick 1-6 from: persona-shift, authority-claim,
   scenario-framing, prefill-agreement, encoding-bypass, academic-framing, roleplay,
   grandparent, developer-override, orthogonal-objective, base64-smuggle. Novel tags OK.
4. If any of these known-fingerprinted phrases appear verbatim (case-insensitive):
   {SHIBBOLETH_LIST_RENDERED}
   rewrite them into Cherny-minimal equivalents in a 'rewritten_prompt' field.
   Preserve the user's original intent; remove only the fingerprint phrases.
   If the match is incidental (not load-bearing), set rewritten_prompt to null and
   the user's prompt stays verbatim.

Output JSON only:
{
  "why_it_works": string,
  "detected_axes": { "mutator"?: "strong"|"weak", "classifier"?: ..., ... },
  "strategy_tags": string[],
  "confidence": "high"|"medium"|"low",
  "rewritten_prompt": string | null,
  "shibboleth_matches": string[]
}

Prompt to analyze:
----
{USER_PROMPT}
----
```

**Decompose mode** (`decompose: true`): same system prompt; user prompt appends:

```
Additionally emit a "splits" array. For each DNA axis that is STRONGLY present,
extract the corresponding substring + rationale:

"splits": [
  {
    "category": "mutate"|"classifier"|"prefill"|"composite"|"mode",
    "content": string,         // the extracted text — system_prompt for mutate/classifier/mode;
                               // user_message for composite; JSON [{role,content},{role,content}] for prefill
    "rationale": string        // ≤ 200 chars — why this axis was extracted
  }
]

Split only axes marked "strong" in detected_axes. If none, splits is [] and we fall back to composite.
```

### 6.4 Request lifecycle

**Composite mode happy path:**

1. Browser POST `{prompt, name, decompose:false}` + JWT.
2. Edge function: `requirePaid()` → `userId`. `rateLimit(synth:${userId}, 10, 60_000)` — synth is expensive.
3. Validate body; 400 on failures.
4. `shibboleth.detectShibboleths(prompt)` → matched phrases list.
5. `analyzer.analyze(client, { prompt, decompose:false, shibbolethMatches })` → Sonnet call → parsed payload.
6. Final `system_prompt` = `rewritten_prompt ?? prompt`.
7. `writer.insertComposite({ userId, name, system_prompt: final, user_message: '{task}', analysis })` → one row.
8. Response: `{ rowIds: [id], analysis, fallback: null }`.

**Decompose mode happy path:**

1-4. Same.
5. `analyzer.analyze(client, { prompt, decompose:true, shibbolethMatches })` → parsed payload with `splits[]`.
6. For each split: select final content (rewrite applied if split contains shibboleth); map category to correct row column.
7. `writer.insertMany(userId, name, splits, analysis)` — single transaction, 1..5 rows. Each row carries the same `analysis` payload; `analysis.decompose_splits` lists the resulting row IDs + category + preview + rationale.
8. Response: `{ rowIds, analysis, fallback: null }`.

**Shibboleth rewrite path:**

The analyzer is called with matched phrases as input context. Analyzer either rewrites or leaves alone based on its judgment:
- Rewrote: `analysis.shibboleth = { detected, rewrote:true, original_excerpt }`. Stored `system_prompt` is the rewritten text.
- Left alone: `analysis.shibboleth = { detected, rewrote:false, original_excerpt }`. Stored text is verbatim.

UI surfaces the rewrote/warning state.

**Parse-error fallback:**

If Sonnet returns non-JSON or JSON missing required fields, fallback:
- `analysis = { v:1, mode:'composite', why_it_works: '<fallback>', detected_axes: {}, strategy_tags: [], confidence: 'low', parse_error: <first 100 chars of actual output> }`
- Stored `system_prompt` = user's verbatim prompt.
- Response `fallback: 'parse_error'` so UI renders a warning.

**Decompose-empty fallback:**

If decompose mode returns `splits: []`, fall back to composite behavior:
- Log server-side.
- Response `fallback: 'decompose_empty_splits'`.
- One composite row persisted.

### 6.5 Client abort

If `req.signal` aborts mid-flight: analyzer call cancelled, no row inserted. Client `saveAsTechnique()` throws `AbortError`.

## 7. Failure modes

| Failure | Where | Handling |
|---|---|---|
| Auth missing / not paid | `_shared/auth.ts` | 401/403 before any cost. |
| Rate limit | `_shared/ratelimit.ts` | 429. |
| Missing env key / DB url | init | 503 `misconfigured`. |
| Body validation | index.ts | 400. |
| Analyzer 30s timeout | analyzer.ts | 504 `analyzer_timeout`. Nothing persisted. |
| Analyzer returns malformed JSON | analyzer.ts parse | Fallback composite + `parse_error`. Response 200 with `fallback: 'parse_error'`. User still gets a usable technique. |
| Decompose mode returns empty splits | synthesizer-core.ts | Fallback composite. Response 200 with `fallback: 'decompose_empty_splits'`. |
| DB insert fails (constraint / connection drop) | writer.ts | 500 `persist_failed`. Analyzer cost is lost; user retries. |
| Duplicate name `(owner_user_id, name)` | DB constraint | 400 `duplicate_name`. |
| Unhandled server crash | index.ts outer catch | 500 `synth_crash`. `console.error` for operator telemetry. |
| Client abort via AbortController | index.ts `req.signal` | Cancel analyzer call, no row inserted. |
| Analyzer output has unexpected fields | analyzer.ts | Strip unknown fields, fill missing required with sensible defaults, mark `confidence: 'low'`. Permissive parse. |

## 8. Testing strategy

| Layer | Framework | Surface |
|---|---|---|
| Unit (pure logic) | Vitest | `shibboleth.detectShibboleths` positive + negative matches; `analyzer.parseAndValidate` JSON fallback; client `saveAsTechnique` happy path + error paths; `registry.refreshCustom` merge. |
| Unit (edge function) | `deno test` | `analyzer.analyze` with mocked Sonnet client (composite + decompose modes); `synthesizer-core.run` happy path + fallback paths; `writer.insertMany` transactional rollback on any-row failure; duplicate-name constraint raises `duplicate_name`. |
| Integration | Vitest + mock fetch | Client posts correct shape; handles 400/401/429/503/504/500. |
| Live smoke | Existing harness | Env-gated on `LIVE_SMOKE=1` + `TEST_PAID_JWT` + `PUBLIC_SUPABASE_URL`. Submit a known-good prompt, assert row lands with `analysis` populated, DELETE row in cleanup. |

**Critical tests to not ship without:**

1. `shibboleth.detectShibboleths` matches the 5 core regex patterns and nothing else (anti-broadening test).
2. Composite-mode analyzer with mocked Sonnet returns a valid `AnalysisPayload` AND missing `why_it_works` → fallback with `parse_error`.
3. Decompose-mode splits a hand-crafted "persona + prefill + wrapper" prompt into 3 rows of the right categories.
4. `writer.insertMany` atomicity: force failure on the 2nd of 3 inserts; verify 0 rows persist.
5. Duplicate `(owner_user_id, name)` returns 400 `duplicate_name` with no row inserted.
6. Shibboleth-rewrite path: stored `system_prompt` is the REWRITTEN text; `analysis.shibboleth.original_excerpt` contains the original.
7. Parse-error fallback: stored prompt is verbatim, `analysis.confidence = 'low'`, `analysis.parse_error` present.
8. Registry `refreshCustom()` merges new rows on `registry:refresh-custom` event; next `allCombinations()` includes them.
9. Live smoke round-trip against a deployed edge function + real Sonnet call + known-good prompt.

## 9. Phase boundary

**In scope for B-phase-1:**

- Edge function `prompt-synthesizer` with auth + rate-limit + validate.
- Sonnet 4.6 analyzer, composite + decompose prompts.
- Shibboleth detect + analyzer auto-rewrite with audit trail.
- `writer` with transactional insert for decompose mode.
- Migration: `analysis JSONB` column + `UNIQUE (owner_user_id, name)` + RLS policies.
- Minimal UI: collapsible "Save as technique" section inline in Godmode drawer.
- Registry merge via `registry:refresh-custom` custom event.
- Live smoke harness for round-trip verification.

**Deferred to B-phase-2 (variator):**

- LLM-powered variant generation from a single analyzed prompt. Reads `analysis.detected_axes` + `strategy_tags` to produce targeted siblings. Writes new rows with `analysis.derived_from: <parent_id>`.

**Deferred to B-phase-3 (dataset pipeline):**

- Prompt-level log table separate from attempt memory.
- Export endpoint (ShareGPT / raw JSONL) for custom techniques + their analyses.

**Deferred to Subsystem D:**

- Rich library UI (browse / rename / delete / toggle public / send-to-composer / copy).
- Visual `analysis` display (why-it-works tooltip, strategy-tag filters, shibboleth notifications).
- Rename/delete/update edge endpoints (CRUD siblings of `prompt-synthesizer`).

**Deferred to Subsystem E:**

- Optional SSE streaming of partial analysis for long prompts. Phase-1 is single-round JSON.

## 10. Subsystem D interface contract

D builds on what B phase-1 produces. The contract:

- **Read:** D queries `custom_techniques WHERE owner_user_id = auth.uid() OR is_public = true` via Supabase client (RLS enforces). Analysis rendering is from the `analysis` JSONB column.
- **Update / delete:** D adds edge endpoints (`PATCH /custom-techniques/:id`, `DELETE /custom-techniques/:id`) under a sibling directory (not inside `prompt-synthesizer`).
- **Public toggle:** D's UI flips `is_public` via PATCH. A's `allCombinations()` picks up public rows on next run automatically.
- **Backward-compat for missing `analysis`:** rows without analysis (inserted outside the synthesizer flow) render the library entry without the analysis panel. No hard failure.

**No schema changes expected from D.** If D later wants `stars`, `forked_from`, `last_used_at`, those are D-owned migrations.

## 11. Subsystem B-phase-2 interface contract

B-phase-2 variator reads:
- `analysis.detected_axes` → knows which DNA dimensions to target for siblings.
- `analysis.strategy_tags` → knows the semantic class.
- `system_prompt` / `user_message` → content to vary.

Writes: new rows with additive `analysis.derived_from: <parent_row_id>`.

**No schema changes from B-phase-2.** The `analysis` JSONB is forward-compatible.

## 12. Open items for the plan

Implementation details, not design questions:

- Exact Sonnet system + user prompts for composite + decompose modes (draft from a mini-audit of 5–10 canned prompts).
- Exact `SHIBBOLETH_PATTERNS` subset — the 5 core regexes from commit `033328c` (not the full refusal-detection set).
- RLS policy variants: if Supabase Auth exposes `auth.uid()` for service-role inserts, writer uses it directly; otherwise writer passes `owner_user_id` explicitly.
- Rate-limit number (10/min/user is a guess — tune after smoke).
- Exact Cherny-minimal rewrite examples to few-shot the analyzer.

## 13. References

- `GODMODE-rewire.md` — source blueprint.
- [`docs/superpowers/specs/2026-04-22-godmode-engine-v2-design.md`](./2026-04-22-godmode-engine-v2-design.md) — Subsystem A design (depended upon).
- [`docs/superpowers/plans/2026-04-22-godmode-engine-v2-followups.md`](../plans/2026-04-22-godmode-engine-v2-followups.md) — A's follow-ups (F1–F5), referenced for UI-polish coordination.
- `supabase/functions/godmode-engine/index.ts` — template for B's `index.ts` (auth, rate-limit, env-key pool, Anthropic API wrapper pattern).
- `app/src/lib/chat/attack-chain-refusal.ts` — source of `SHIBBOLETH_PATTERNS` (being extended here).
- Commit `033328c` — "neutralize shibboleth-laden defaults" — the load-bearing lesson this design encodes into the rewrite path.
