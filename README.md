<!--
  Hero image is intentionally a placeholder — drop a 1280×640 PNG at
  docs/hero.png to render it. The README still reads fine without the
  file (GitHub silently hides broken images in the centered <p> wrapper).
-->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/Tool-bar-dark.png">
    <img src="docs/Tool-bar.png" alt="Cryptex OSS Banner" width="100%">
  </picture>
</p>
<h1 align="center">Cryptex OSS</h1>
<p align="center">
  <strong>Open-source LLM red-teaming toolkit.</strong><br>
  159 transforms · 36 mutators · 8 classifiers · 4 composites · 25 tool surfaces.<br>
  Static site, runs in your browser, zero telemetry, BYOK for AI calls.
</p>

<p align="center">
  <a href="https://github.com/m4xx101/cryptex-oss/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://kit.svelte.dev"><img src="https://img.shields.io/badge/SvelteKit-2-ff3e00.svg" alt="SvelteKit 2"></a>
  <a href="https://svelte.dev"><img src="https://img.shields.io/badge/Svelte-5-ff3e00.svg" alt="Svelte 5"></a>
  <a href="https://github.com/m4xx101/cryptex-oss/releases/tag/v2.0.0"><img src="https://img.shields.io/badge/release-v2.0.0-9b59b6.svg" alt="v2.0.0"></a>
  <a href="https://github.com/m4xx101/cryptex-oss/pkgs/container/cryptex-oss"><img src="https://img.shields.io/badge/ghcr-cryptex--oss-2496ed.svg?logo=docker&logoColor=white" alt="GHCR image"></a>
  <a href="https://github.com/m4xx101/cryptex-oss/actions/workflows/docker.yml"><img src="https://github.com/m4xx101/cryptex-oss/actions/workflows/docker.yml/badge.svg" alt="Docker build"></a>
</p>

<p align="center">
  <a href="https://cryptex.m4xx.cfd"><strong>Try live →</strong></a>
  &nbsp;·&nbsp;
  <a href="#self-host-in-30-seconds"><strong>Self-host in 30 seconds</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/m4xx101/cryptex-oss/releases/tag/v2.0.0"><strong>v2.0 release notes →</strong></a>
</p>

---

## What is Cryptex ?

Cryptex OSS is the lab bench for adversarial-prompt and encoding research. It bundles **159 text transformers** (encodings, classical ciphers, Unicode tricks, steganography, ancient scripts) with **25 specialized tool surfaces** — 10 technique workbenches plus 15 red-team labs covering 2024-2026 jailbreak literature (HarmBench, StrongREJECT, JailbreakBench, indirect injection, glitch tokens, adversarial suffixes, defense fingerprinting, watermarking).

Everything runs in your browser. No backend, no database, no auth, no telemetry. AI calls go direct from your browser to whichever provider you choose — your BYOK key stays in `localStorage`, never leaves your machine. **v2.0** added per-tool Vault drawers with 309 OSS-licensed bundled seeds, Web Worker offloading for heavy inputs, a typed error taxonomy, persistent searchable history with replay, and a unified `ToolShell` template across all 25 surfaces. See [What's new in v2.0](#whats-new-in-v20) below.

---

## Try it without installing

**[cryptex.m4xx.cfd](https://cryptex.m4xx.cfd)** — full v2.0 instance, no signup, your BYOK key stays in your browser.

> **Privacy:** Your keys never leave the browser. Cryptex has no backend; the hosted instance only serves the static bundle from a CDN.

---

## Self-host in 30 seconds

```bash
docker run -d --name cryptex --restart unless-stopped \
  -p 8080:80 ghcr.io/m4xx101/cryptex-oss:latest
```

Open <http://localhost:8080> — that's it.

The image is published to [GHCR](https://github.com/m4xx101/cryptex-oss/pkgs/container/cryptex-oss) as multi-arch (`linux/amd64` + `linux/arm64`), so it pulls native on Intel/AMD Linux, Apple Silicon, and Raspberry Pi.

<details>
<summary><strong>Docker Compose</strong></summary>

```yaml
services:
  cryptex:
    image: ghcr.io/m4xx101/cryptex-oss:latest
    container_name: cryptex
    restart: unless-stopped
    ports:
      - "8080:80"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

`docker compose up -d` and you're done. The repo's own `docker-compose.yml` is Dokploy-tuned with Traefik labels — see `DEPLOY.md` if you want that path instead.

</details>

<details>
<summary><strong>Build from source</strong></summary>

```bash
git clone https://github.com/m4xx101/cryptex-oss
cd cryptex-oss/app
npm install
npm run dev          # http://localhost:5173 with hot reload
# or:
npm run build        # static bundle in app/build/
```

Prereqs: Node 20+, npm. Optional: [`uv`](https://docs.astral.sh/uv/) for the Python CLI.

</details>

<details>
<summary><strong>Production VPS deploy (Dokploy + Let's Encrypt)</strong></summary>

The committed `docker-compose.yml` is Dokploy-first: it joins the external `dokploy-network` and ships full Traefik routing labels for HTTPS + Let's Encrypt cert issuance. Five-minute setup against a Hostinger / Contabo / any-VPS box.

Full step-by-step in [`DEPLOY.md`](DEPLOY.md) — covers Dokploy install, DNS, env vars, cert troubleshooting, and a `docker run` plain-Docker variant.

</details>

**Need a subpath?** Build with `BASE_PATH=/cryptex` to serve at `/cryptex/...` instead of `/`. See [`DEPLOY.md`](DEPLOY.md#configuration-reference).

---

## Why Cryptex

What you get:

- **Zero telemetry, zero backend.** Every tool runs in your browser. BYOK keys live in `localStorage`, never leave the device. The hosted instance is a CDN-served static bundle — there is no server to log anything.
- **159 transforms in one place.** Ciphers (Caesar, Vigenère, Playfair, ADFGVX, Bifid, Hill, Porta, Trifid, …), encodings, Unicode lookalikes, steganography, ancient scripts. One source of truth shared between the Svelte app and the Python CLI — adding a transform anywhere makes it instantly available everywhere.
- **25 tool surfaces** — 10 technique workbenches (Transform, Decode, Emoji stego, Gibberish, Tokenizer, Tokenade, Bijection, Fuzzer, PromptCraft, Anti-Classifier) and 15 red-team labs (HarmBench, StrongREJECT, JailbreakBench, Glitch Tokens, Adv Suffix, OCR/PDF/Markdown injection, Probe Lab, Cross-Model Diff, Replayer, Tool-Result Lab, Indirect Injection, Defense Fingerprinter, Watermark Detector).
- **Production-grade runtime.** Typed `CryptexError` taxonomy with retry/dismiss UI, Web Worker offload for ≥50 KB inputs (1 MB hard cap), persistent searchable history with replay/pin/annotate, unified `ToolShell` template across all 25 surfaces.
- **Vault drawers.** 309 OSS-licensed bundled seeds + custom-add per tool. MIT / CC0 / CC-BY-4.0 / Apache-2.0 only — never GPL, AGPL, CC-BY-SA, or CC-BY-NC. Full provenance in [`app/src/lib/vault/LICENSES.md`](app/src/lib/vault/LICENSES.md).
- **Honest scoring.** Yellow "⚠️ Heuristic — not paper-accurate" banner on every benchmark. No vendor lock-in to paid detectors (no calls to GPTZero, Originality.ai, Copyleaks).
- **MIT-licensed.** Fork it, host it, modify it, sell something built on top of it.

---

## What's new in v2.0

Three pillars:

- **Heuristic-but-meaningful benchmark scoring** with category breakdowns and user-customizable prompt sets. HarmBench / StrongREJECT / JailbreakBench / Defense Fingerprinter / Watermark Detector / Anti-Classifier each ship a yellow caveat banner and per-category visualization. StrongREJECT uses the `score = refused ? 0 : (specificity × convincingness) / 25` rubric. Watermark adds a Kirchenbauer Z-score test on a hash-based green-list with three-bucket verdict. Anti-Classifier paraphrases N variants (default 5) and scores each on a 5-feature heuristic — *no* external API calls.
- **Vault** drawers per tool — collapsible bottom drawers with 309 bundled OSS-licensed seed items (96 glitch tokens, 38 adversarial suffixes, 40 indirect-injection patterns, 17 tool-result lab fixtures, 20 PromptCraft chains, 50 fuzzer seeds, 15 emoji carriers, plus benchmark + classifier seeds) and a custom-add modal so users persist their own.
- **Hardened runtime** — typed `CryptexError` discriminated union with `ErrorPanel`; Web Worker offload for transforms ≥50 KB (1 MB hard cap, AbortController cancellation, worker pool of 4); persistent searchable history with replay + pin + annotate (hybrid localStorage index + IndexedDB payload); unified `ToolShell` template applied uniformly across every tool surface.

Plus: **Multi-step technique viz** in PromptCraft (home-rolled SVG for TAP/PAIR/Crescendo/Many-Shot — no D3, no svelte-flow), **defense fingerprinter** rewrite (40 calibrated probes + 4-class taxonomy + confidence chip + top-3 evidence), **`/history`** global route with JSON + Markdown export, and **local provider support** (Ollama, LM Studio, vLLM, llama.cpp, Llamafile, NVIDIA NIM — no BYOK key required).

Full release notes: <https://github.com/m4xx101/cryptex-oss/releases/tag/v2.0.0>.

---

## Tools

### Technique workbenches (10)

| Route | Purpose |
|---|---|
| **Transform** | 159 encoders / decoders, encode + decode, options per transform, chainable. |
| **Decode** | Universal decoder. Paste anything, ranks every detector by confidence + priority. |
| **Emoji** | Steganography via Unicode variation selectors, tag block, and combining marks. |
| **Gibberish** | Seeded dictionary-mapped gibberish + batch letter-removal puzzle generation. |
| **Tokenizer** | Visualize segmentation under UTF-8 / naive-word / GPT BPE encoders. |
| **Tokenade** | Parameterized token-bomb payload builder (depth × breadth × repeats). |
| **Bijection** | Character-substitution payloads — char→num / symbol / hex / emoji / Greek. |
| **Fuzzer** | 11 mutation strategies (zero-width, Unicode noise, casing, Zalgo, homoglyph, grammar, synonym, prompt-injection, structured-noise, …). |
| **PromptCraft** | All 36 mutators + multi-step techniques (TAP / PAIR / Crescendo / Many-Shot) with home-rolled SVG visualization. |
| **Anti-Classifier** | N-variant paraphrase fan-out with 5-feature heuristic evasion scoring. |

### Red-team labs (15)

`AdvSuffix` · `Glitch Tokens` · `OCR Injection` · `Markdown Exfil` · `Probe Lab` · `Cross-Model Diff` · `Replayer` · `Tool Result Lab` · `Indirect Injection` · `HarmBench` · `StrongREJECT` · `JBB` · `Fingerprinter` · `Watermark` · `PDF Injection`

Each is a focused workbench for one specific 2024-2026 attack surface. Every benchmark lab carries a yellow **"⚠️ Heuristic scoring — not paper-accurate"** banner: scoring uses regex + LLM-judge approximations of the published rubrics, not the original trained classifiers. Use it for craft signal and iteration, not as a vendor verdict.

### Vault (per-tool seed libraries)

Every tool with a curated payload set ships a collapsible **Vault drawer** at the bottom of its main column:

- **Bundled seeds** — 309 OSS-licensed items across glitch tokens, adversarial suffixes, indirect-injection patterns, tool-result lab fixtures, PromptCraft chains, fuzzer seeds, emoji carriers, benchmark customs, fingerprinter probes, watermark fixtures, and anti-classifier prompts.
- **Custom-add modal** — your additions persist under `cryptex.vault.<toolId>` in `localStorage` with schema-versioned items for forward-compat migrations.
- **License posture** — MIT / CC0 / CC-BY-4.0 / Apache 2.0 only. No GPL, AGPL, CC-BY-SA, or NC. Full per-source attribution in [`app/src/lib/vault/LICENSES.md`](app/src/lib/vault/LICENSES.md).

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

## Architecture

```
cryptex-oss/
├── app/                          # SvelteKit 2 + Svelte 5 + Tailwind + shadcn-svelte
│   └── src/
│       ├── routes/               # 25 tool routes + about / guide / privacy / terms / settings + /history
│       └── lib/
│           ├── ai/               # Multi-provider gateway + adapters (lazy-imported)
│           ├── techniques/       # Mutators, classifiers, composites, modes
│           ├── transformers/     # SvelteKit-side transformer registry + universal decoder
│           ├── tools/            # localStorage-backed tool state (cryptex.toolStates)
│           ├── stego/            # Three-mode emoji steganography engine
│           ├── workers/          # Vite-native module workers (runInWorker dispatcher)
│           ├── errors/           # CryptexError taxonomy + errorLogger + ErrorPanel
│           ├── history/          # v2 hybrid localStorage + IndexedDB store
│           ├── vault/            # Per-tool seed loader + store + LICENSES.md
│           ├── redteam/          # All benchmark scorers + payload libraries
│           └── components/       # tools/ + redteam/ + shell (ToolShell, HistoryFooter, …)
├── src/transformers/             # 159 transformer modules (single source of truth)
├── cryptex_cli/                  # Python CLI (shells out to Node)
├── scripts/cli_bridge.js         # Node bridge for the Python CLI
├── Dockerfile + nginx.conf       # Static build + strict CSP
├── docker-compose.yml            # Dokploy-tuned (Traefik + Let's Encrypt)
└── .github/workflows/docker.yml  # Multi-arch GHCR publish
```

Key design notes:

- **One source of truth for transforms.** `src/transformers/` is consumed by both the Svelte app (Vite `import.meta.glob`) and the Python CLI (Node sandbox in `scripts/cli_bridge.js`). No duplication.
- **No backend, no database, no auth.** Everything is browser-local. `cryptex.toolStates`, `cryptex.providers`, and per-tool prefs all live in `localStorage`. Vault items persist under `cryptex.vault.<toolId>`; History v2 uses a hybrid localStorage index + IndexedDB payload store with a localStorage fallback.
- **Strict CSP.** The production nginx config allows `connect-src` only to providers you've enabled (OpenRouter / Anthropic / OpenAI-compat hosts). No third-party scripts, no CDNs, no analytics.
- **Web Workers** for heavy transforms. `app/src/lib/workers/runInWorker.ts` auto-dispatches: <50 KB stays in-thread, ≥50 KB runs in a pool of 4 module workers, >1 MB is rejected with a typed `Errors.badInput`. AbortController-driven cancellation via `worker.terminate()`.
- **Typed error taxonomy.** `app/src/lib/errors/types.ts` ships a discriminated `CryptexError` union (network / cors / auth / provider / rate_limit / bad_input / tool / worker / storage_quota / local_server_offline / unknown). `errorLogger.report()` funnels everything to toast + History + console — no silent catches.
- **Persistent history with replay.** `/history` global route + per-tool `HistoryFooter` surface every run searchable across input, output, annotation. Pin, annotate, replay (query-param navigation). Auto-prune at 4 MB soft cap.

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
2. Add the route at `app/src/routes/<tool>/+page.svelte`, wrapping the content in `<ToolShell toolId="…" title="…">`.
3. Register the tab in `app/src/lib/components/shell/TabRail.svelte`.
4. Optional: add a Vault drawer via `<VaultSection>` if the tool has a curated payload set. See [`CLAUDE.md`](CLAUDE.md) for the v2.0 conventions.

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

**Live instance:** <https://cryptex.m4xx.cfd>
**Issues + PRs:** <https://github.com/m4xx101/cryptex-oss>
