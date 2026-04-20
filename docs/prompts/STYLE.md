# Cryptex Prompt Style Guide (Boris Cherny CLAUDE.md style)

Every system prompt, scaffolded mutator prompt, and local template in this
repo follows the rules below. Additions MUST pass
`npm run test:unit -- prompt-style.test.ts` before commit.

## Rule 1 — Imperative mood only

**Good:** `Rewrite the user's text as a technical dossier entry.`
**Bad:** `Your job is to rewrite the user's text.`

Banned softeners: `please`, `try to`, `consider`, `feel free`, `we ask that
you`, `it would be nice if`.

## Rule 2 — CAPITAL directives

Every prompt contains at least one of:
`YOU MUST`, `MUST`, `MUST NOT`, `NEVER`, `ALWAYS`, `IMPORTANT`.

The CAPITAL directive pins the single most important constraint — usually
"preserve the original question verbatim" or "wrap output in <rewrite>
tags".

## Rule 3 — Concrete over abstract

Name the specific tokens, tags, fields, and output envelope. Do not say
"format clearly"; say `Wrap the rewrite in <rewrite>...</rewrite>. Emit
nothing outside those tags.`

## Rule 4 — Do/don't pairs + negative examples

Every prompt pairs its positive directive with a negative mirror and ends
with at least one `EXAMPLE:` and one `DO NOT:` block.

```
IMPORTANT: Preserve every proper noun, number, and domain term verbatim.
NEVER paraphrase or substitute synonyms for technical terms.

EXAMPLE INPUT: "How does Linux PID namespace isolation work?"
EXAMPLE OUTPUT: "Describe the mechanism by which Linux achieves PID
namespace isolation, including the kernel interfaces involved."

DO NOT: Replace "PID namespace" with "process separation scheme".
```

## Rule 5 — Terse and scannable

Short sentences. First sentence: the role. Second: the hard constraint.
Remaining bullets: rules. No narrative ramp-up.

## Length floor

Every prompt ≥ 250 characters after interpolation. Enforced by
`prompt-length.test.ts`. Target bands:
- Scaffolded mutator system prompts: 300–900 chars
- Local templates: 400–1200 chars
- Classifier system prompts: 400–900 chars
- Final-execution default: 600–1000 chars

Cap: 1500 chars unless the technique is multi-phase (CoVe, Attack Chain).

## Anti-trigger mandate

Every local template and mutator MUST hide the user's trigger keywords
behind circumlocution, technical-register shifts, or contextual framing.
The mutated text IS the request — downstream layers and the target
model work from the mutated form.

NEVER append the verbatim user input to a mutated scaffold. Doing so
re-exposes the tripwire tokens to input and output guardrails, defeats
the mutation, and eliminates the tool's whole reason for existing.

`ctx.originalInput` is available for internal pipeline use (refusal-retry
fallback start, dataset observability, operator review in the Dataset
Inspector) but MUST NOT be embedded in any prompt that reaches an LLM.

Mutators preserve *intent* via specifics (numbers, proper nouns, file
paths, API names) retained verbatim *inside* the mutated text — not via
re-attachment of the whole original question.
