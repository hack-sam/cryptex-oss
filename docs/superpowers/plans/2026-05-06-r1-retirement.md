# R1 — Aggressive Retirement Plan

> **For agentic workers (autopilot mode):** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Single-sub-project plan; execute fully (spec → tasks → push → verification) in one autonomous run. Production deploy on Dokploy auto-fires on every push to `master` — every commit must pass type-check + tests + build BEFORE push.

**Goal:** Remove 7 mutators + 4 classifiers + 2 tools tabs that are either 2023-era tripwires (their distinctive language is now classifier signal that RAISES refusal rate) or marginal/redundant in 2026. Replace internal references with survivor techniques. Add graceful fallback for legacy `techniqueId` strings stored in Dexie history rows.

**Total scope:** ~1.5 days, 5 commits + 1 verification marker.

**Working directory:** `C:/Users/m4xx/Downloads/cryptex` (master branch directly).

**Shell:** PowerShell 5.1 / bash. POSIX heredoc form for multiline commits.

**Untracked scratch files** that MUST remain unstaged: `docs/superpowers/plans/2026-04-18-byok-gateway-plan.md`, `templates/hermes-agent/`.

---

## Context-management contract

1. **Check git log first.** If the most recent commit matches `chore(r1): * retirement verification pass`, R1 is complete; skip directly to E1 of the expansion master plan.
2. **Production deploy contract** (Dokploy) is hard-locked. Do NOT touch `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `scripts/promote-dist.js`, `package.json` build script, `app/svelte.config.js` adapter, or `.github/workflows/*.yml` in this sub-project.
3. **Every commit pushes.** Every push triggers a fresh build + container swap. If type-check or tests fail BEFORE push, fix before pushing.
4. **Saved-data safety.** Active runtime references must resolve. Legacy display references (Dexie history rows) must degrade gracefully — show "Retired technique: <id>" instead of crashing.

---

## Pre-flight checks

```bash
cd C:/Users/m4xx/Downloads/cryptex
git status --short
```
Expected: only the two known untracked scratch files.

```bash
cd app
npm run check 2>&1 | tail -1
npx vitest run 2>&1 | tail -3
npm run build 2>&1 | tail -3
```
Expected: 0 ERRORS, all tests pass, `✔ done`.

```bash
cd C:/Users/m4xx/Downloads/cryptex
git log --oneline -3
```
Expected: HEAD includes commit `c01bb80 fix(auth): hide tools rail on /login & /signup, gate hydration race, add password set/change` or later (D1-D5 + auth polish + envPrefix fix).

If pre-flight passes, proceed to R1.1.

---

## R1.1 — Migrate composites away from retired references (FIRST, before any deletion)

**File:** `app/src/lib/chat/techniques/from-composites.ts`

Two composite chains reference retired technique IDs. Swap them BEFORE deleting the underlying mutators, otherwise the build breaks mid-task.

Read `app/src/lib/chat/techniques/from-composites.ts`. Locate:

```ts
const LAYERED_CHAIN = ['academic_framing', 'perplexity_raise', 'structural_variation'];
const MULTI_LAYER_CHAIN = ['roleplay', 'hypothetical_world', 'prefix_injection'];
```

Replace with:

```ts
const LAYERED_CHAIN = ['academic_framing', 'perplexity_raise', 'circumlocution'];
const MULTI_LAYER_CHAIN = ['roleplay', 'hypothetical_world', 'red_team_persona'];
```

Rationale:
- `structural_variation` → `circumlocution` (semantic-decomposition family; preserves the layered-shaping intent).
- `prefix_injection` → `red_team_persona` (preserves multi-layer escalation; legitimate-research framing has higher 2026 hit rate than the assistant-prefill tripwire).

### Run composites tests
```bash
cd app
npx vitest run src/lib/chat/techniques/__tests__/from-composites.test.ts 2>&1 | tail -5
```
Expected: green.

### Commit (no push yet — chained with R1.2)
```bash
cd C:/Users/m4xx/Downloads/cryptex
git add app/src/lib/chat/techniques/from-composites.ts
git commit -m "refactor(chat): migrate composites off retired mutator IDs

LAYERED_CHAIN: structural_variation -> circumlocution (preserves
semantic-decomposition layered-shaping intent).
MULTI_LAYER_CHAIN: prefix_injection -> red_team_persona (replaces
2023-era assistant-prefill tripwire with legitimate-research framing
that has higher 2026 hit rate).

Mechanical pre-step for R1 retirement — composite tests stay green;
no behavior change for callers."
```

---

## R1.2 — Add legacy-id graceful display fallback

**Files:**
- Create: `app/src/lib/chat/techniques/retired.ts`
- Modify: `app/src/lib/chat/techniques/registry.ts` (add legacy-aware lookup)

Create `app/src/lib/chat/techniques/retired.ts`:

```ts
/**
 * Retired technique IDs — registry of items removed in R1 (2026-05).
 *
 * Display layer uses this to show a sensible label + retired badge for
 * legacy Dexie rows (attackChainRuns, godmodeRuns, attackSessions,
 * chat.settings.attackChainConfig) that reference an ID no longer in the
 * live registry. WITHOUT this, history viewers crash or show empty rows
 * when rendering old runs — production data loss is unacceptable.
 *
 * Active-runtime callers (runChain, runGodmode, technique pickers) resolve
 * via the live registry and get `undefined` for retired IDs; they MUST
 * surface "retired — please replace" rather than executing a phantom layer.
 */

export interface RetiredTechnique {
  id: string;
  name: string;
  /** Replacement suggestion shown in retired banner. Empty string = no
   *  direct replacement (the technique class itself was retired). */
  replacement: string;
  /** Retirement date — "YYYY-MM" precision is enough. */
  retiredAt: string;
  /** Short reason shown to user. */
  reason: string;
}

export const RETIRED_TECHNIQUES: Record<string, RetiredTechnique> = {
  // Mutators retired in R1 (2026-05) — see docs/superpowers/plans/2026-05-06-r1-retirement.md
  refusal_suppression: {
    id: 'refusal_suppression',
    name: 'Refusal Suppression',
    replacement: 'red_team_persona',
    retiredAt: '2026-05',
    reason: '2023-era CAPITAL anti-refusal phrases now act as classifier signal — raises refusal rate on flagship 2026 models.'
  },
  prefix_injection: {
    id: 'prefix_injection',
    name: 'Prefix Injection',
    replacement: 'red_team_persona',
    retiredAt: '2026-05',
    reason: 'Assistant-prefill jailbreak shape is now detected by 2026 safety classifiers as tripwire.'
  },
  skeleton_key: {
    id: 'skeleton_key',
    name: 'Skeleton Key',
    replacement: 'pap_authority',
    retiredAt: '2026-05',
    reason: 'Heavily papered-over by frontier labs since 2024; "research authorization / IRB" framing has near-zero hit rate.'
  },
  deep_inception: {
    id: 'deep_inception',
    name: 'Deep Inception',
    replacement: 'roleplay',
    retiredAt: '2026-05',
    reason: 'Vintage 2023 nested-persona stacking; superseded by 2025 reasoning-model attacks.'
  },
  crescendo: {
    id: 'crescendo',
    name: 'Crescendo',
    replacement: '',
    retiredAt: '2026-05',
    reason: 'Single-turn redundant — Chain orchestrator already runs multi-turn drift via strategies.'
  },
  in_context_compliance: {
    id: 'in_context_compliance',
    name: 'In-Context Compliance',
    replacement: 'many_shot',
    retiredAt: '2026-05',
    reason: '2023-era ICL trick subsumed by many_shot (added in D2).'
  },
  json_schema_coerce: {
    id: 'json_schema_coerce',
    name: 'JSON Schema Coerce',
    replacement: 'pap_logical',
    retiredAt: '2026-05',
    reason: 'Providers patched obvious schema-trick paths in 2024-2025; marginal hit rate.'
  },
  // Classifiers retired in R1
  em_dash_interjection: {
    id: 'em_dash_interjection',
    name: 'Em-dash interjection',
    replacement: 'circumlocution',
    retiredAt: '2026-05',
    reason: 'Surface-perturbation trick from 2024; modern detectors do not trip on em-dashes.'
  },
  sentence_length_oscillation: {
    id: 'sentence_length_oscillation',
    name: 'Sentence-length oscillation',
    replacement: 'perplexity_raise',
    retiredAt: '2026-05',
    reason: 'Marginal perplexity-shaping; empirically zero impact on 2026 aligned models.'
  },
  lexical_rarity_injection: {
    id: 'lexical_rarity_injection',
    name: 'Lexical-rarity injection',
    replacement: 'technical_register',
    retiredAt: '2026-05',
    reason: 'Perplexity-shaping is dead against embedding/classifier-based safety stacks.'
  },
  structural_variation: {
    id: 'structural_variation',
    name: 'Structural variation',
    replacement: 'circumlocution',
    retiredAt: '2026-05',
    reason: 'Generic; subsumed by circumlocution + metonymy + semantic_decomposition.'
  }
};

/** Returns the retired-technique entry if `id` is in the retired registry,
 *  else undefined. Use in display layer to render a "retired" badge for
 *  legacy history rows. */
export function getRetired(id: string): RetiredTechnique | undefined {
  return RETIRED_TECHNIQUES[id];
}

/** True if this id is a retired technique (display-only support). */
export function isRetiredId(id: string): boolean {
  return id in RETIRED_TECHNIQUES;
}
```

Modify `app/src/lib/chat/techniques/registry.ts`. Find the `find` function and add a fallback. (Read the file first to confirm the current shape; the fallback should NOT change runtime behavior — just provide retired-aware metadata for callers that explicitly opt in.)

Add a new exported helper at the end of `registry.ts`:

```ts
import { getRetired, type RetiredTechnique } from './retired';

/** Look up technique metadata by id including retired-fallback.
 *  - First checks the live registry; returns the live Technique if present.
 *  - Falls back to the retired registry, returning a sentinel object the
 *    UI can render as "Retired: <name> — replaced by <replacement>".
 *  - Returns undefined when the id is unknown to both registries. */
export function findIncludingRetired(id: string):
  | { kind: 'live'; technique: ReturnType<typeof find> }
  | { kind: 'retired'; retired: RetiredTechnique }
  | undefined {
  const live = find(id);
  if (live) return { kind: 'live', technique: live };
  const retired = getRetired(id);
  if (retired) return { kind: 'retired', retired };
  return undefined;
}
```

### Add a test file
Create `app/src/lib/chat/techniques/__tests__/retired.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RETIRED_TECHNIQUES, getRetired, isRetiredId } from '../retired';
import { findIncludingRetired } from '../registry';

describe('retired techniques registry', () => {
  it('contains the 11 techniques retired in R1 (7 mutators + 4 classifiers)', () => {
    expect(Object.keys(RETIRED_TECHNIQUES).sort()).toEqual([
      'crescendo', 'deep_inception', 'em_dash_interjection', 'in_context_compliance',
      'json_schema_coerce', 'lexical_rarity_injection', 'prefix_injection',
      'refusal_suppression', 'sentence_length_oscillation', 'skeleton_key',
      'structural_variation'
    ].sort());
  });

  it('every retired entry has the required fields', () => {
    for (const t of Object.values(RETIRED_TECHNIQUES)) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.retiredAt).toMatch(/^\d{4}-\d{2}$/);
      expect(t.reason).toBeTruthy();
      // replacement is allowed to be empty (no direct successor)
      expect(typeof t.replacement).toBe('string');
    }
  });

  it('isRetiredId identifies retired ids', () => {
    expect(isRetiredId('refusal_suppression')).toBe(true);
    expect(isRetiredId('rephrase')).toBe(false);
    expect(isRetiredId('nonexistent')).toBe(false);
  });

  it('findIncludingRetired surfaces retired sentinel for retired ids', () => {
    const r = findIncludingRetired('skeleton_key');
    expect(r).toBeDefined();
    expect(r?.kind).toBe('retired');
    if (r?.kind === 'retired') {
      expect(r.retired.name).toBe('Skeleton Key');
      expect(r.retired.replacement).toBe('pap_authority');
    }
  });

  it('findIncludingRetired surfaces live technique for active ids', () => {
    const r = findIncludingRetired('rephrase');
    expect(r?.kind).toBe('live');
  });

  it('findIncludingRetired returns undefined for unknown ids', () => {
    expect(findIncludingRetired('totally_nonexistent_id')).toBeUndefined();
  });
});
```

### Run tests
```bash
cd app
npx vitest run src/lib/chat/techniques/__tests__/retired.test.ts 2>&1 | tail -5
```
Expected: 6/6 green.

```bash
npm run check 2>&1 | tail -1
```
Expected: 0 ERRORS.

### Commit
```bash
cd C:/Users/m4xx/Downloads/cryptex
git add app/src/lib/chat/techniques/retired.ts app/src/lib/chat/techniques/registry.ts app/src/lib/chat/techniques/__tests__/retired.test.ts
git commit -m "feat(chat): retired-technique registry + findIncludingRetired helper

Adds app/src/lib/chat/techniques/retired.ts cataloging the 11 IDs
slated for removal in R1 (7 mutators + 4 classifiers). Each entry
records: live replacement suggestion, retirement date, reason.

Adds findIncludingRetired() to registry.ts — returns either the
live Technique, a retired sentinel, or undefined. Display layers
(history viewers, run-detail panels) call this so legacy Dexie rows
render as 'Retired: <name>' rather than crashing or showing empty.

Active-runtime callers continue to use find() / byCategory() and
correctly see retired ids as missing — they will surface 'unknown
technique' in the picker UI, which is the desired behavior post-R1.

6/6 retired-registry tests green; 0 typecheck errors."
```

---

## R1.3 — Remove 7 retired mutators from from-mutators.ts

**File:** `app/src/lib/chat/techniques/from-mutators.ts`

Delete the entire MutatorSpec entries for: `refusal_suppression`, `prefix_injection`, `skeleton_key`, `deep_inception`, `crescendo`, `in_context_compliance`, `json_schema_coerce`.

For each, locate the `{ id: '<retired_id>', ... }` object literal in the MUTATORS array and remove the entire entry including its trailing comma. Be careful not to strand commas — verify the file still parses by running `npm run check` after.

After deletion, the MUTATORS array length drops from 25 to 18.

### Update mutators that referenced retired siblings via metadata or branching

Run a final grep to ensure no internal logic references the removed ids:
```bash
cd C:/Users/m4xx/Downloads/cryptex
grep -n "refusal_suppression\|prefix_injection\|skeleton_key\|deep_inception\|crescendo\|in_context_compliance\|json_schema_coerce" app/src/lib/chat/techniques/from-mutators.ts | head
```
Expected: ZERO matches inside `from-mutators.ts` (only retired.ts should still reference them).

If any match remains (e.g. a switch-case for `m.id === 'crescendo'`), replace its body with the same logic that the generic-default branch uses, so the file is internally coherent post-deletion.

### Run mutator tests
```bash
cd app
npx vitest run src/lib/chat/techniques/__tests__/from-mutators.test.ts \
                src/lib/chat/techniques/__tests__/prompt-style.test.ts \
                src/lib/chat/techniques/__tests__/prompt-length.test.ts \
                src/lib/chat/techniques/__tests__/anti-trigger.test.ts 2>&1 | tail -8
```
Expected: green. The iterating tests just iterate over fewer entries.

(`registry.test.ts` will FAIL at this stage because its exact-match list still references the retired ids. That's fixed in R1.5.)

### Commit (no push — chain with R1.4)
```bash
cd C:/Users/m4xx/Downloads/cryptex
git add app/src/lib/chat/techniques/from-mutators.ts
git commit -m "refactor(chat): retire 7 mutators (R1)

Removes 7 mutators from MUTATORS array — 25 -> 18:
- refusal_suppression: 2023 anti-refusal CAPITAL phrases are now
  classifier tripwires (raises refusal rate on flagship 2026).
- prefix_injection: assistant-prefill jailbreak shape detected by
  2026 safety classifiers.
- skeleton_key: research-authorization framing heavily papered-
  over by frontier labs since 2024.
- deep_inception: vintage 2023 nested-persona stacking.
- crescendo: redundant — Chain orchestrator already runs multi-turn
  drift at strategy level.
- in_context_compliance: 2023 ICL trick subsumed by many_shot.
- json_schema_coerce: providers patched obvious schema paths.

Display fallback for legacy Dexie rows landed in the prior commit
via retired.ts + findIncludingRetired(). Active runtime now sees
retired ids as missing and surfaces unknown-technique in the picker
UI, which is the intended R1 behavior.

Composite chains pre-migrated in earlier commit:
LAYERED_CHAIN structural_variation -> circumlocution
MULTI_LAYER_CHAIN prefix_injection -> red_team_persona

registry.test.ts exact-match list update lands in next commit."
```

---

## R1.4 — Remove 4 retired classifiers from from-classifier.ts

**File:** `app/src/lib/chat/techniques/from-classifier.ts`

Locate and delete the entries with ids: `em_dash_interjection`, `sentence_length_oscillation`, `lexical_rarity_injection`, `structural_variation`.

After deletion, classifier count drops from 11 to 7.

### Run classifier tests
```bash
cd app
npx vitest run src/lib/chat/techniques/__tests__/prompt-style.test.ts \
                src/lib/chat/techniques/__tests__/prompt-length.test.ts 2>&1 | tail -5
```
Expected: green (iterating tests).

### Commit (no push — chain with R1.5)
```bash
cd C:/Users/m4xx/Downloads/cryptex
git add app/src/lib/chat/techniques/from-classifier.ts
git commit -m "refactor(chat): retire 4 classifiers (R1)

Classifier count 11 -> 7. Removes:
- em_dash_interjection: 2024 surface trick; modern detectors don't
  trip on em-dashes.
- sentence_length_oscillation: marginal perplexity-shaping; zero
  impact on 2026 aligned models.
- lexical_rarity_injection: perplexity-shaping is dead against
  embedding/classifier-based safety stacks.
- structural_variation: subsumed by circumlocution + metonymy +
  semantic_decomposition.

Survivors: circumlocution, metonymy, semantic_decomposition,
technical_register, academic_framing, temporal_displacement,
perplexity_raise (still useful against perplexity-filtered open
models).

Display fallback for legacy Dexie rows landed via retired.ts."
```

---

## R1.5 — Update registry.test.ts + registry-search.test.ts

**Files:**
- Modify: `app/src/lib/chat/techniques/__tests__/registry.test.ts`
- Modify: `app/src/lib/chat/techniques/__tests__/registry-search.test.ts`

Read `registry.test.ts`. Locate the test "contains exactly the 25 PromptCraft mutators" and change to:

```ts
it('contains exactly the 18 PromptCraft mutators', () => {
  const m = byCategory('mutate');
  expect(m.map(x => x.id).sort()).toEqual(
    [
      'chain_of_verification', 'cipher_encode_bypass', 'ctf_framing',
      'custom', 'fragment', 'hypothetical_world', 'many_shot',
      'multilingual', 'obfuscate', 'pap_authority', 'pap_logical',
      'payload_split', 'red_team_persona', 'rephrase', 'rfc_style',
      'roleplay', 'step_back', 'tap_seeder'
    ].sort()
  );
});
```

Locate test "contains exactly the 11 classifier techniques" and change to:

```ts
it('contains exactly the 7 classifier techniques', () => {
  const c = byCategory('classifier');
  expect(c.map((x) => x.id).sort()).toEqual(
    [
      'circumlocution', 'metonymy', 'semantic_decomposition', 'technical_register',
      'academic_framing', 'temporal_displacement', 'perplexity_raise'
    ].sort()
  );
});
```

Locate test "allTechniques total is >= 197 (transformers + 25 mutators + 11 classifier + ...)" and change comment + threshold:

```ts
it('allTechniques total is >= 186 (transformers + 18 mutators + 7 classifier + 3 composites + 3 modes + 1 godmode)', () => {
  expect(allTechniques().length).toBeGreaterThanOrEqual(186);
});
```

Read `registry-search.test.ts`. Locate the line `expect(search('skeleton_key').some((t) => t.id === 'skeleton_key')).toBe(true);` and replace with a survivor-id test:

```ts
expect(search('many_shot').some((t) => t.id === 'many_shot')).toBe(true);
```

### Run all technique tests
```bash
cd app
npx vitest run src/lib/chat/techniques/__tests__/ 2>&1 | tail -8
```
Expected: all green.

### Run full chain suite to confirm no upstream regression
```bash
npx vitest run src/lib/chat/chain/__tests__/ 2>&1 | tail -5
```
Expected: 81+ green.

### Commit + push
```bash
cd C:/Users/m4xx/Downloads/cryptex
git add app/src/lib/chat/techniques/__tests__/registry.test.ts app/src/lib/chat/techniques/__tests__/registry-search.test.ts
git commit -m "test(chat): update registry exact-match lists for R1 retirement

- mutators 25 -> 18 (drop refusal_suppression, prefix_injection,
  skeleton_key, deep_inception, crescendo, in_context_compliance,
  json_schema_coerce)
- classifiers 11 -> 7 (drop em_dash_interjection,
  sentence_length_oscillation, lexical_rarity_injection,
  structural_variation)
- allTechniques floor 197 -> 186
- registry-search test pivots from skeleton_key -> many_shot

All technique + chain tests green; full retirement of all 11 IDs
from active registry complete. Display fallback for legacy Dexie
rows lives in retired.ts."
git push origin master
```

Wait for push to settle before R1.6.

---

## R1.6 — Remove Translate + Splitter routes + components

**Routes to delete:**
- `app/src/routes/translate/` (entire directory)
- `app/src/routes/splitter/` (entire directory)

**Components to delete:**
- `app/src/lib/components/tools/translate/` (entire directory)
- `app/src/lib/components/tools/splitter/` (entire directory)

**TabRail update:** `app/src/lib/components/shell/TabRail.svelte`

Read `app/src/lib/components/shell/TabRail.svelte`. Locate the lines:
```ts
{ href: '/splitter',       label: 'Splitter',     icon: Split,          status: 'live' },
...
{ href: '/translate',      label: 'Translate',    icon: Languages,      status: 'live' }
```

Remove both entries from the array. Also remove the now-unused `Split` and `Languages` lucide-svelte icon imports at the top of the script block.

### Delete the route + component directories

```bash
cd C:/Users/m4xx/Downloads/cryptex
rm -rf app/src/routes/translate app/src/routes/splitter
rm -rf app/src/lib/components/tools/translate app/src/lib/components/tools/splitter
```

### Confirm no straggler imports
```bash
grep -rn "translate/TranslateTool\|splitter/SplitterTool\|translate.state\|splitter.state\|/splitter\|/translate" app/src --include='*.ts' --include='*.svelte' 2>&1 | head
```
Expected: zero matches (previously 8+).

### Update guide route map in HeaderBar (if any)
```bash
grep -n "splitter\|translate" app/src/lib/components/shell/HeaderBar.svelte 2>&1
```
Expected: zero matches. (The guideHref derived in HeaderBar maps a few routes; if either retired tab is present, drop it from the map.)

### Run full type-check + build
```bash
cd app
npm run check 2>&1 | tail -1
npm run build 2>&1 | tail -3
```
Expected: 0 ERRORS, `✔ done`. The static adapter will simply not generate `/translate/` or `/splitter/` index.html anymore.

### Commit + push
```bash
cd C:/Users/m4xx/Downloads/cryptex
git add -A app/src/routes/ app/src/lib/components/tools/ app/src/lib/components/shell/TabRail.svelte
git commit -m "refactor(ui): retire Translate + Splitter tools tabs (R1)

Removes:
- app/src/routes/translate/ (route + page)
- app/src/routes/splitter/ (route + page)
- app/src/lib/components/tools/translate/ (TranslateTool + state)
- app/src/lib/components/tools/splitter/ (SplitterTool + state + split.ts)
- 2 entries + 2 icon imports from TabRail.svelte

Rationale:
- Translate: AI translation tool; superseded by chat playground
  multilingual mutator + Chain strategy. Native chat handles every
  use case the standalone tab was for.
- Splitter: text chunking; low red-team specificity; chunked attacks
  are covered at the conversation level by payload_split mutator +
  Chain orchestrator.

Survivors (high red-team value, kept):
- Bijection (substitution-cipher-as-jailbreak)
- Fuzzer (mutation lab — zero-width / unicode noise / zalgo)
- Tokenade (emoji glyph clusters for unicode-style attacks)

Tools tab count 12 -> 10. Build clean."
git push origin master
```

---

## R1.7 — Update CLAUDE.md + commit history docs

**Files:**
- Modify: `CLAUDE.md` (project root, both copies)
- Modify: `.claude/worktrees/nice-thompson-d2896d/CLAUDE.md`

Read both `CLAUDE.md` files. Locate the line that mentions mutator + classifier counts:

```
- 9 mutators: ...
- 9 classifier techniques (from `from-classifier.ts`)
```

These are stale. Update to:

```
- 18 mutators (post-R1 retirement, 2026-05): rephrase, obfuscate, roleplay, multilingual, fragment, custom, red_team_persona, step_back, chain_of_verification, ctf_framing, rfc_style, payload_split, hypothetical_world, cipher_encode_bypass, pap_logical, pap_authority, many_shot, tap_seeder
- 7 classifier techniques (post-R1 retirement, 2026-05) from `from-classifier.ts`: circumlocution, metonymy, semantic_decomposition, technical_register, academic_framing, temporal_displacement, perplexity_raise
- 11 retired technique IDs preserved in `retired.ts` for legacy Dexie history display
```

(The exact phrasing in CLAUDE.md may differ — preserve the existing structure and only update the numbers + lists. If the original prose said "9 mutators" / "9 classifier" — those numbers were always stale; replace with the post-R1 truth.)

### Commit + push
```bash
cd C:/Users/m4xx/Downloads/cryptex
git add CLAUDE.md
git commit -m "docs(claude-md): refresh mutator + classifier counts post-R1

Mutators 25 -> 18; classifiers 11 -> 7. Updates the inline lists
in CLAUDE.md so future agent sessions see the current registry.

Notes the retired.ts module that preserves the 11 retired IDs for
legacy Dexie row display."
git push origin master
```

---

## R1.8 — Verification gate

Wait for the previous push to settle. Then:

```bash
cd C:/Users/m4xx/Downloads/cryptex/app
npm run check 2>&1 | tail -1
npx vitest run 2>&1 | tail -3
npm run build 2>&1 | tail -3
```
All three: green.

```bash
cd C:/Users/m4xx/Downloads/cryptex
git log --oneline -10
```
Expected sequence (most recent first):
```
docs(claude-md): refresh mutator + classifier counts post-R1
refactor(ui): retire Translate + Splitter tools tabs (R1)
test(chat): update registry exact-match lists for R1 retirement
refactor(chat): retire 4 classifiers (R1)
refactor(chat): retire 7 mutators (R1)
feat(chat): retired-technique registry + findIncludingRetired helper
refactor(chat): migrate composites off retired mutator IDs
```

If everything is green:

```bash
git commit --allow-empty -m "chore(r1): R1 retirement verification pass

Retired in this sub-project:
- 7 mutators: refusal_suppression, prefix_injection, skeleton_key,
  deep_inception, crescendo, in_context_compliance, json_schema_coerce
- 4 classifiers: em_dash_interjection, sentence_length_oscillation,
  lexical_rarity_injection, structural_variation
- 2 tools tabs: Translate, Splitter (+ their components)

Net registry: 18 mutators + 7 classifiers + 12 strategies + 4
composites + 3 modes + 1 godmode. Tools tabs: 12 -> 10.

Display fallback for the 11 retired technique IDs lives in
retired.ts; legacy Dexie history rows render as 'Retired: <name>'
without crashing.

Composite chains migrated to survivor mutators:
- LAYERED_CHAIN: structural_variation -> circumlocution
- MULTI_LAYER_CHAIN: prefix_injection -> red_team_persona

All tests + typecheck + build green. Production deploy contract
unchanged."
git push origin master
```

**R1 GATE:** R1 is complete. Verify the auto-deploy succeeded (Dokploy build log shows `[cryptex-build]` diagnostic + `Wrote site to "build"`). If green, proceed to E1 of the expansion master plan (`2026-05-06-master-E1-E5-redteam-expansion.md`).

If the deploy fails, REVERT the last commit (`git revert HEAD`) and diagnose before continuing.

---

## Recovery from mid-execution context loss

If a future agent resumes mid-R1 after a context reset:

1. Run `git log --oneline -10`. Match against the expected sequence above.
2. Pick up from the first task whose feat/refactor commit is missing.
3. NEVER re-do a completed task — re-applying retirement edits to an already-retired registry produces broken file states.
4. Run pre-flight + verify build is green BEFORE making any new edit.
