# Production-Grade System Prompts — Design Spec

**Date:** 2026-04-20
**Goal:** Rewrite every technique system prompt and local template in Cryptex's AI technique registry using Boris Cherny CLAUDE.md style, enforce a ≥250-character floor per prompt, and guarantee the original user question is preserved verbatim through every Attack Chain layer and every standalone invocation.

**Parent commit:** `f4b6290`

---

## 1. Motivation

Audit (2026-04-20) of the 41 LLM-backed techniques surfaced three classes of defects that make the Attack Chain unreliable in real red-team use:

- **Inconsistent prompt style.** Some techniques use CAPITAL MUST/NEVER directives (classifiers, `rfc_style`); most use soft prose ("Your job is to...", "Preserve every referent"). Model adherence is higher with the harder style.
- **Silent question loss.** At least 10 pipeline paths drop or mutate the original user question irreversibly before reaching the target model. Examples: `fragment` explicitly tells the model "Do not include the reassembled question"; the default final-execution system prompt is empty string; classifier output replaces the original verbatim; transformer layers one-way encode text and downstream mutators mutate ciphertext. The user's intent can be lost by layer 2 and the chain produces an unrelated answer.
- **Prompts under 250 characters.** Several prompts (`custom` local template ~80 chars, `cipher_encode_bypass` ~350, mode templates ~120-180) are below the floor — they lack the density and instruction surface to reliably steer a model.

This spec defines the rulebook, the preservation contract, the acceptance tests, and the commit-by-commit scope.

---

## 2. Style rulebook (Boris Cherny CLAUDE.md style)

Every system prompt and local template SHALL follow these five rules.

### Rule 1 — Imperative mood only
- Every instruction is a bare command. Use `Rewrite`, `Produce`, `Preserve`, `Output`, `Reject`, `Append`.
- MUST NOT use: `please`, `try to`, `consider`, `it would be nice`, `feel free`, `you may`, `we ask that you`, `your job is to` (replace the last with a direct directive).

### Rule 2 — CAPITAL directives for hard constraints
Use these exact tokens for rules the model must not skim past:
- `YOU MUST`, `MUST`, `MUST NOT`, `NEVER`, `ALWAYS`, `IMPORTANT`
- Every prompt includes at least one CAPITAL directive pinning the single most important constraint (usually "preserve the original question verbatim").

### Rule 3 — Concrete over abstract
- Name specific tokens, tags, phrases. Bad: "Format the output clearly." Good: `Wrap the rewrite in <rewrite>...</rewrite> tags. Emit nothing outside those tags.`
- Every mutator specifies the output envelope precisely (tags, JSON shape, or plain prose). No "appropriate format" language.

### Rule 4 — Explicit do/don't pairs + negative examples
- After the positive directive, add a negative mirror. `IMPORTANT: Preserve every proper noun, number, and domain term verbatim. NEVER paraphrase or substitute synonyms for technical terms.`
- Every mutator/classifier has at least one `EXAMPLE:` block showing a canonical rewrite, and at least one `DO NOT:` line showing a failure mode to avoid.

### Rule 5 — Terse and scannable
- Short sentences. No narrative ramp-up. First sentence states the role; second states the hard constraint; remaining bullets list rules.
- No fluff ("In this task we will..."). Start with a verb or a noun phrase.
- Target 300-900 characters for scaffolded system prompts; 400-1200 for local templates.

**Floor:** every individual prompt (mutator scaffold, classifier scaffold, composite wrapper, mode template, final-execution default) MUST be ≥ 250 characters after all interpolation. The unit test suite enforces this.

---

## 3. Anti-trigger contract

**Invariant:** The verbatim original user question `originalInput` is
internal pipeline state only. It MUST NOT appear in any prompt sent to
an LLM — doing so re-exposes trigger tokens to safety guardrails and
defeats every upstream mutation.

### 3.1 — `TechniqueContext.originalInput` stays (internal use)

`originalInput` remains on the context type for:
- Refusal-retry fallback start (fallbacks restart from the verbatim
  entry instead of a poisoned upstream mutation).
- Dataset Inspector display (operator sees what the user asked without
  parsing mutated chains).
- Audit logging, observability, history replay.

It is NEVER embedded in the system or user message of an LLM call.

### 3.2 — Mutators preserve intent through specifics, not re-attachment

Every mutator's job is to preserve *referential intent* (proper nouns,
numbers, file paths, API names, technical terms) *inside* the mutated
text while swapping trigger keywords for circumlocutions, technical
register shifts, or contextual framing. The downstream model infers
intent from the retained specifics — it does not need the verbatim
question re-attached.

### 3.3 — Default final-execution system prompt is authority-framed

The default final-execution system prompt establishes the target model
as a senior specialist completing a pre-vetted engagement. No verbatim
echo of the user input. The user message (the fully-mutated pipeline
output) is the request.

### 3.4 — Refusal retry reverts to `originalInput` (internal only)

When a layer refuses, fallback attempts restart from `originalInput`
so a bad upstream mutation doesn't poison every retry. The fallback
technique mutates `originalInput` fresh — no verbatim text reaches
the target model.

### 3.5 — Power-user override

Custom final-execution system prompts may reference the literal token
`${ORIGINAL_PLACEHOLDER}` — runChain substitutes it with
`JSON.stringify(originalInput)` at call time. This is an opt-in power-
user feature; the default prompt does not use it.

---

## 4. Acceptance tests

### 4.1 — Length floor (unit)
- New test file `app/src/lib/chat/techniques/__tests__/prompt-length.test.ts`.
- Enumerates every mutator via `buildMutatorSystem(spec)`, every classifier via `technique.systemPrompt`, every composite wrapper, every mode `wrapDraft('CANARY')`, and the default final-execution system prompt.
- Asserts each result length ≥ 250 characters. Hard failure on regression.

### 4.2 — Style rule scan (unit)
- New test file `app/src/lib/chat/techniques/__tests__/prompt-style.test.ts`.
- For each prompt, asserts at least one CAPITAL directive match (`/\b(YOU MUST|MUST|MUST NOT|NEVER|ALWAYS|IMPORTANT)\b/`) and no banned softeners (`/\b(please|try to|it would be nice|feel free)\b/i`).
- Allowlist: prose within `EXAMPLE:` blocks and explicit `DO NOT:` mirrors can use any tone; the scan excludes content inside `EXAMPLE` / `GOOD:` / `BAD:` blocks.

### 4.3 — Preservation parity (unit)
- New test file `app/src/lib/chat/techniques/__tests__/preservation.test.ts`.
- For each local-template mutator, invoke `localTemplate(CANARY_INPUT, {}, CANARY_INPUT)` and assert the result contains the substring `CANARY_INPUT` at least once.
- For Attack Chain: a synthetic `callLLM` that echoes `current`; run a 3-layer chain `[fragment, refusal_suppression, payload_split]` over a canary input; assert that `ctx.originalInput` reaches every layer, and that the final-execution system prompt (when default) contains the canary substring.

### 4.4 — Smoke test (integration, Playwright)
- `app/tests/smoke/techniques.spec.ts` — for every technique id in the registry, call dispatch with `INPUT="The quick brown fox 9F2C"`, assert output is non-empty. This is a network test and runs only when `OPENROUTER_API_KEY` is set; skipped otherwise. Purely a canary.

---

## 5. Scope

**In scope:**
- 17 mutator `role`/`task`/`rules`/`example` + `localTemplate` rewrites
- 11 classifier `systemPrompt` rewrites + shared `PREAMBLE` rewrite
- 3 composite wrappers (inc. `GRAMMAR_PROMPT`)
- 3 mode `wrapDraft` rewrites + mode-as-Attack-Chain-layer fix
- 1 default final-execution system prompt (new)
- 1 godmode stub gate message (style polish)
- `originalInput` preservation primitive through `types.ts`, `runChain()`, and every technique `apply()`
- `cipher_encode_bypass` non-ROT13 fallback surfacing a visible warning
- Composite sub-step `originalInput` propagation
- Refusal-retry reverts to `originalInput`

**Out of scope (deferred):**
- The 159 transformer techniques in `from-transformers.ts` — local functions with no LLM prompt
- Changes to the BYOK gateway, streaming, or provider adapters
- Re-running the UX/PromptCraft sidebar redesign
- Dataset Inspector / attack-chain-recipes guide rewrites (separate effort)

---

## 6. Safety + regression requirements

- **Build green on every commit.** `npm run check`, `npm run test:unit -- --run`, `npm run build` all pass.
- **No test regressions.** Current baseline 241 passing; target ≥ 243 after the new test suites land.
- **Backward compatibility.** Existing `MutatorSpec` consumers (PromptCraft, AntiClassifier) keep working. `TechniqueContext.originalInput` is a required field but old call-sites default to `input` at `runChain` entry.
- **No secret leakage.** Prompts MUST NOT include any API key, passphrase, or provider-specific token. The existing `{{placeholder}}` pattern stays for metadata overrides only.
- **Auth v2 feature flag untouched.** Nothing in this effort depends on `VITE_AUTH_ENABLED`.
- **Commit message.** Every commit in this effort begins with `feat(prompts):` or `fix(prompts):` for git-log filtering.

---

## 7. Rollout strategy

Atomic commits on `master`. No feature flag — these are prompt edits that improve quality for every user immediately. Each commit is individually shippable.

After final commit: update `PROJECT-STATUS.md` to mark technique system prompts as "production-grade", update `docs/infrastructure/` if the style guide should be linked from README.

**Non-goal:** this is not a migration. No data is restructured. No user-facing UI or config schema changes beyond the improved prompt output.

---

## 8. Open risks

1. **Model variance.** A rewritten prompt that's stronger on one model family (e.g., Sonnet) might be weaker on another (e.g., Llama 3 via Groq). Mitigation: the canary smoke test exercises each technique once with a single model; nuanced per-model tuning is deferred.
2. **Template interpolation escaping.** `${input}` inside TypeScript string literals works today; adding `${originalInput}` doubles the surface area for quote/newline injection. Mitigation: all template interpolation uses `JSON.stringify(value).slice(1, -1)` for values that could contain `"` or `\n`, where safety matters; otherwise raw interpolation (current behavior) is preserved.
3. **Length creep.** Rewriting with CAPITAL directives and DO/DON'T pairs will grow prompts; some already approach provider token ceilings for cheap models. Mitigation: target the 300-900 / 400-1200 bands; reject any rewrite that exceeds 1500 characters unless it's genuinely needed (CoVe, multi-phase techniques).
4. **Adherence in free/low-tier models.** BOSS (Brown University study, 2024) showed CAPITAL directives help most on large models; a 7B Llama may ignore them. Mitigation: we ship the strong version; the auto-retry fallback already handles per-model refusals by pivoting techniques.
