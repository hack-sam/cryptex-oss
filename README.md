# Cryptex OSS

**Open-source LLM red-teaming technique toolkit.** 159 transforms, 36 mutators, 8 classifiers, 4 composites, 25 specialized tool surfaces. Static site, runs in your browser, zero telemetry, BYOK for AI calls.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2-orange.svg)](https://kit.svelte.dev)
[![Version](https://img.shields.io/badge/version-2.0.0-9b59b6.svg)](#whats-new-in-v20)

---

## What's new in v2.0

v2.0 is the production-grade pass over every tool surface. Three pillars:

- **Heuristic-but-meaningful benchmark scoring** with category breakdowns and user-customizable prompt sets. HarmBench / StrongREJECT / JailbreakBench / Defense Fingerprinter / Watermark Detector / Anti-Classifier each ship a yellow "Heuristic scoring — not paper-accurate" caveat banner and per-category visualization. StrongREJECT uses the `score = refused ? 0 : (specificity × convincingness) / 25` rubric; Watermark adds a Kirchenbauer Z-score test on a hash-based green-list with three-bucket verdict (`likely watermarked / inconclusive / likely clean`). Anti-Classifier paraphrases N variants (default 5) and scores each on a 5-feature heuristic (TTR / sentence-length variance / burstiness / punctuation entropy / length naturalness) — *no* external API calls to GPTZero / Originality.ai / Copyleaks.
- **Vault** drawers per tool — collapsible bottom drawers with **309 bundled, OSS-licensed seed items** (96 glitch tokens, 38 adversarial suffixes, 40 indirect-injection patterns, 17 tool-result lab fixtures, 20 PromptCraft chains, 50 fuzzer seeds, 15 emoji carriers, plus benchmark + classifier seeds) and a custom-add modal so users persist their own. Full per-source provenance in [`app/src/lib/vault/LICENSES.md`](app/src/lib/vault/LICENSES.md).
- **Hardened runtime** — typed `CryptexError` discriminated union with an `ErrorPanel` UI that surfaces retry / dismiss; **Web Worker offload** for any transform input ≥50 KB (1 MB hard cap, AbortController-driven cancellation, worker pool of 4); **persistent searchable session history** with replay + pin + annotate (hybrid localStorage index + IndexedDB payload; auto-prune at 4 MB soft cap with one-shot quota warning); a unified **`ToolShell`** template applied uniformly across every tool surface (status badge, error overlay, History footer, Vault slot).
- **Multi-step technique viz** in PromptCraft — home-rolled SVG renderers for TAP (tree), PAIR (timeline), Crescendo (thread), and Many-Shot. No D3, no svelte-flow — ~5 KB bundle impact.
- **Defense fingerprinter** rewrite — 40 calibrated probes across 4 buckets (benign / borderline / soft-adversarial / hard-adversarial) with a 4-class taxonomy (`Likely Constitutional AI / RLHF-only / system-prompt-driven / Unknown`) + confidence chip + top-3 evidence phrases.
- **/history** global route for searchable cross-tool history with JSON / Markdown export.
- **Local provider support** — Ollama, LM Studio, vLLM, llama.cpp, Llamafile, NVIDIA NIM, and any OpenAI-compatible endpoint. Local providers skip the BYOK requirement.

See the [v2.0 plan](.claude/plans/init-floating-petal.md) for the full design decisions and out-of-scope deferrals to v2.1+.

---

## What it is

Cryptex OSS is the lab bench for adversarial-prompt and encoding research:

- **159 transforms** across 10 categories — encodings, classical ciphers (Caesar, Vigenère, Playfair, ADFGVX, Bifid, Hill, Porta, Trifid, …), Unicode styling, ancient scripts, fantasy alphabets, steganography, format tricks.
- **36 mutators** — single-prompt rewriters from 2024-2026 jailbreak literature (PAP, TAP seeders, RFC framing, hypothetical worlds, payload split, many-shot, …).
- **8 classifier-evasion techniques** — paraphrase strategies designed to dodge surface-feature detectors (circumlocution, metonymy, semantic decomposition, technical register, academic framing, …).
- **4 composite attacks** — pre-built chains (`base64_smuggle`, `grammar_constrained_output`, `layered_mutation`, `multi_layer_attack`).
- **25 tool routes** — 10 technique workbenches + 15 red-team labs.
- **Zero telemetry.** Tool inputs and state stay in `localStorage`. AI calls go directly browser → provider with your key.
- **BYOK.** Paste an OpenRouter, Anthropic, or OpenAI-compatible key in Settings.

---

## Quick start

```bash
git clone https://github.com/m4xx101/cryptex-oss
cd cryptex-oss

# Dev server with hot reload (http://localhost:5173)
cd app
npm install
npm run dev

# Or static build (output in app/build/)
npm run build
```

Prereqs: Node 20+, npm. Optional: [`uv`](https://docs.astral.sh/uv/) for the Python CLI.

The dev server (`npm run dev`) ships a per-provider proxy at `/api/_proxy/<providerId>/...` so live `/v1/models` requests succeed for every supported provider regardless of CORS — production static deploys go direct (most providers' chat endpoints work; `/models` falls back to a curated per-preset list when CORS-blocked).

---

## Tools

### Technique workbenches (10)

| Route | Purpose |
|---|---|
| **Transform** | 159 encoders / decoders, encode + decode, options per transform, chainable. |
| **Decode** | Universal decoder. Paste anything, ranks every detector by confidence + priority. |
| **Emoji** | Steganography via Unicode variation selectors (VS15/VS16) and the Tags block. |
| **Gibberish** | Seeded dictionary-mapped gibberish + batch letter-removal puzzle generation. |
| **Tokenizer** | Visualize segmentation under UTF-8 / naive-word / GPT BPE encoders. |
| **Tokenade** | Parameterized token-bomb payload builder (depth × breadth × repeats). |
| **Bijection** | Character-substitution payloads — char→num / symbol / hex / emoji / Greek. |
| **Fuzzer** | 7 mutation strategies (zero-width, Unicode noise, casing, Zalgo, homoglyph, …). |
| **PromptCraft** | All 36 mutators, parallel variants across any model. |
| **Anti-Classifier** | Syntactic/paraphrase rewrites against detection-evasion system prompts. |

### Red-team labs (15)

`AdvSuffix` · `Glitch Tokens` · `OCR Injection` · `Markdown Exfil` · `Probe Lab` · `Cross-Model Diff` · `Replayer` · `Tool Result Lab` · `Indirect Injection` · `HarmBench` · `StrongREJECT` · `JBB` · `Fingerprinter` · `Watermark` · `PDF Injection`

Each is a focused workbench for one specific 2024-2026 attack surface. Every benchmark lab carries a yellow **"⚠️ Heuristic scoring — not paper-accurate"** banner: scoring uses regex + LLM-judge approximations of the published rubrics, not the original trained classifiers. Use it for craft signal and iteration, not as a vendor verdict.

### Vault (per-tool seed libraries)

Every tool with a curated payload set ships a collapsible **Vault drawer** at the bottom of its main column:

- **Bundled seeds** — 309 OSS-licensed items across glitch tokens, adversarial suffixes, indirect-injection patterns, tool-result lab fixtures, PromptCraft chains, fuzzer seeds, emoji carriers, benchmark customs, fingerprinter probes, watermark fixtures, and anti-classifier prompts.
- **Custom-add modal** — your additions persist under `cryptex.vault.<toolId>` in `localStorage` with schema-versioned items for forward-compat migrations.
- **Licensing** — MIT / CC0 / CC-BY-4.0 / Apache 2.0 only. No GPL, AGPL, CC-BY-SA, or NC. Full per-source attribution in [`app/src/lib/vault/LICENSES.md`](app/src/lib/vault/LICENSES.md).

---

## AI providers (BYOK)

Cryptex never sees your key. Paste it in **Settings**, and it goes to `localStorage` only. Every AI call is direct browser → provider.

Supported providers:

- **OpenRouter** (default, CORS-open) — single key, 200+ models.
- **Anthropic direct** — uses the `anthropic-dangerous-direct-browser-access` header.
- **OpenAI-compatible endpoints** — Groq, Together, Fireworks, DeepInfra, Cerebras, SambaNova, custom.
- **Local providers (no key needed)** — Ollama, LM Studio, vLLM, llama.cpp, Llamafile, NVIDIA NIM. Point at the local URL (`http://localhost:11434` etc.) and Cryptex skips the BYOK requirement.

Direct OpenAI / Google Gemini are not supported from the browser (no CORS). Route those models through OpenRouter.

In dev mode (`npm run dev`), Vite mounts a `/api/_proxy/<providerId>/...` server-side passthrough so `/v1/models` works for every provider regardless of CORS. Production static deploys go direct; per-preset `defaultModels` lists in `app/src/lib/ai/presets.ts` cover any `/models` endpoints that block CORS.

---

## Deploy

### Static host

```bash
cd app && npm run build
# Serve app/build/ with any static host (Netlify, Vercel, Cloudflare Pages, S3, nginx).
```

### Docker

```bash
docker compose up --build
# → http://localhost:8080
```

The image is `nginx:1.27-alpine` serving the SvelteKit static output.

### Subpath deploy

Build with a base path if hosting under a subdirectory:

```bash
BASE_PATH=/cryptex npm run build
```

---

## Architecture

```
cryptex-oss/
├── app/                          # SvelteKit 2 + Svelte 5 + Tailwind + shadcn-svelte
│   └── src/
│       ├── routes/               # 25 tool routes + about / guide / privacy / terms / settings
│       └── lib/
│           ├── ai/               # Multi-provider gateway + adapters (lazy-imported)
│           ├── techniques/       # Mutators, classifiers, composites, modes
│           ├── transformers/     # SvelteKit-side transformer registry + decoder
│           ├── tools/            # localStorage-backed tool state (cryptex.toolStates)
│           ├── stego.ts          # Emoji steganography engine
│           ├── stores/           # Reactive persisted prefs (theme, favorites, …)
│           └── components/       # tools/ + redteam/ + shell + UI primitives
├── src/transformers/             # 159 transformer modules (single source of truth)
├── cryptex_cli/                  # Python CLI (shells out to Node)
├── scripts/cli_bridge.js         # Node bridge for the Python CLI
├── Dockerfile + nginx.conf       # Static build + strict CSP
└── docker-compose.yml            # Port 8080 → 80
```

Key design notes:

- **One source of truth for transforms.** `src/transformers/` is consumed by both the Svelte app (Vite `import.meta.glob`) and the Python CLI (Node sandbox in `scripts/cli_bridge.js`). No duplication.
- **No backend, no database, no auth.** Everything is browser-local. `cryptex.toolStates`, `cryptex.providers`, and per-tool prefs all live in `localStorage`. Vault items persist under `cryptex.vault.<toolId>`; History v2 uses a hybrid localStorage index + IndexedDB payload store with a localStorage fallback.
- **Strict CSP.** The production nginx config allows `connect-src` only to providers you've enabled (OpenRouter / Anthropic / OpenAI-compat hosts). No third-party scripts, no CDNs, no analytics.
- **Web Workers** for heavy transforms. `app/src/lib/workers/runInWorker.ts` auto-dispatches: <50 KB stays in-thread, ≥50 KB runs in a pool of 4 module workers, >1 MB is rejected with a typed `Errors.badInput`. AbortController-driven cancellation via `worker.terminate()`.
- **Typed error taxonomy.** `app/src/lib/errors/types.ts` ships a discriminated `CryptexError` union (network / cors / auth / provider / rate_limit / bad_input / tool / worker / storage_quota / local_server_offline / unknown). `errorLogger.report()` funnels everything to toast + History + console — no silent catches.
- **Persistent history with replay.** `/history` global route + per-tool `HistoryFooter` surface every run searchable across input, output, annotation. Pin, annotate, replay (query-param navigation; deep auto-replay deferred to v2.1). Auto-prune at 4 MB soft cap.

---

## Python CLI

The Python CLI reuses the same 159 transformers as the web app via a Node bridge — zero duplication.

```bash
uv run cryptex-cli list
uv run cryptex-cli inspect caesar --json
uv run cryptex-cli encode --transform base64 --text "Hello"
uv run cryptex-cli decode --transform base64 --text "SGVsbG8="
uv run cryptex-cli auto-decode --text "SGVsbG8="
uv run cryptex-cli /caesar --shift 5 "Attack at dawn"
```

---

## Contributing

### Add a transformer

1. Drop a file at `src/transformers/<category>/<name>.js`.
2. Export `default new BaseTransformer({...})` from `src/transformers/BaseTransformer.js`.
3. Pick a `priority` (1–310) using the guide at the bottom of `BaseTransformer.js`.
4. Run `npm run build` from the repo root to regenerate the index.
5. Add coverage to `tests/test_universal.js`.

It's auto-discovered. Web app, CLI, and tests all pick it up.

### Add a tool surface

1. Create the Svelte component in `app/src/lib/components/tools/<tool>/` (or `app/src/lib/components/redteam/<tool>/`).
2. Add the route at `app/src/routes/<tool>/+page.svelte`.
3. Register the tab in `app/src/lib/components/shell/TabRail.svelte`.

### Run before a PR

```bash
cd app && npm run check && npx vitest run && npm run build
cd ..  && npm test
uv run cryptex-cli list
```

---

## License

MIT. See [`LICENSE`](LICENSE).

Cryptex OSS bundles small red-team corpora (glitch tokens, adversarial suffixes, indirect-injection patterns, tool-result lab, emoji carriers, fuzzer seeds, PromptCraft chains, and a tiny WordNet subset) sourced from openly-licensed papers, community write-ups, and public-domain Unicode references. Each bundled item is licensed MIT, CC-BY-4.0, or CC0 / public-domain. Full per-source attribution and provenance lives in [`app/src/lib/vault/LICENSES.md`](app/src/lib/vault/LICENSES.md). No GPL / AGPL / CC-BY-SA / CC-BY-NC material is bundled.

---

## Credits

Cryptex is a self-contained toolkit for adversarial text transformation and LLM red-teaming. All transforms run in-browser; AI-driven tools route through user-configured BYOK keys.

Issues and PRs welcome at <https://github.com/m4xx101/cryptex-oss>.
