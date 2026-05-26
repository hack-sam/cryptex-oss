<!--
  Hero image lives at docs/Tool-bar.png (and docs/Tool-bar-dark.png for
  the light-mode swap). Screenshot triplet placeholders below render
  gracefully when the asset files do not exist; GitHub silently hides
  broken <img> inside centered <p>. Drop these to replace the placeholders:
    docs/img/screenshot-transforms.png      first feature shot
    docs/img/screenshot-promptcraft.png     second feature shot
    docs/img/screenshot-harmbench.png       third feature shot
-->
<p align="center">
<img src="docs/img/logo.png" alt="Cryptex OSS" width="7%">
<h1 align="center">Cryptex OSS</h1>
</p>
<p align="center">
  <strong>Open-source LLM red-team lab.</strong><br>
  159 transforms, 25 tool surfaces, BYOK gateway. Runs in your browser.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
  <a href="https://github.com/m4xx101/cryptex-oss/releases/tag/v2.0.1"><img src="https://img.shields.io/badge/release-v2.0.1-9b59b6.svg" alt="v2.0.1"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-keep--a--changelog-orange.svg" alt="Changelog"></a>
  <a href="https://github.com/m4xx101/cryptex-oss/pkgs/container/cryptex-oss"><img src="https://img.shields.io/badge/ghcr-cryptex--oss-2496ed.svg?logo=docker&logoColor=white" alt="GHCR image"></a>
  <a href="https://github.com/m4xx101/cryptex-oss/actions/workflows/docker.yml"><img src="https://github.com/m4xx101/cryptex-oss/actions/workflows/docker.yml/badge.svg" alt="Docker build"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Svelte-5-ff3e00.svg?logo=svelte&logoColor=white" alt="Svelte 5">
  <img src="https://img.shields.io/badge/SvelteKit-2-ff3e00.svg?logo=svelte&logoColor=white" alt="SvelteKit 2">
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6.svg?logo=typescript&logoColor=white" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Tailwind-4-38bdf8.svg?logo=tailwindcss&logoColor=white" alt="Tailwind 4">
  <img src="https://img.shields.io/badge/shadcn--svelte-✓-000000.svg" alt="shadcn-svelte">
  <img src="https://img.shields.io/badge/Vite-7-646cff.svg?logo=vite&logoColor=white" alt="Vite 7">
  <img src="https://img.shields.io/badge/Vitest-3-6e9f18.svg?logo=vitest&logoColor=white" alt="Vitest 3">
  <img src="https://img.shields.io/badge/nginx-alpine-009639.svg?logo=nginx&logoColor=white" alt="nginx alpine">
  <img src="https://img.shields.io/badge/Docker-multi--arch-2496ed.svg?logo=docker&logoColor=white" alt="Docker multi-arch">
</p>

<p align="center">
  <a href="https://cryptex.m4xx.cfd/?ref=github.com"><strong>Try live</strong></a>
  &nbsp;·&nbsp;
  <a href="#self-host-in-30-seconds"><strong>Self-host in 30 seconds</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/USAGE.md"><strong>Offensive recipes</strong></a>
  &nbsp;·&nbsp;
  <a href="CHANGELOG.md"><strong>Changelog</strong></a>
</p>

---

<p align="center">
  <img src="docs/img/screenshot-promptcraft.png" alt="PromptCraft multi-step viz" width="100%">
</p>
<p align="center">
  <sub>Left: 159 transformers, encode + decode, options per transform. Middle: PromptCraft multi-step viz (TAP tree shown). Right: HarmBench heuristic scoring with per-category breakdown.</sub>
</p>

---

## What it is

Cryptex bundles 159 text transformers (encodings, classical ciphers, Unicode tricks, steganography, ancient scripts) with 25 specialized tool surfaces. Ten technique workbenches (Transform, Decode, Emoji stego, Gibberish, Tokenizer, Tokenade, Bijection, Fuzzer, PromptCraft, Anti-Classifier) and fifteen red-team labs covering the 2024 to 2026 jailbreak literature (HarmBench, StrongREJECT, JailbreakBench, indirect injection, glitch tokens, adversarial suffixes, defense fingerprinting, watermark forensics). It is the lab bench for adversarial-prompt and encoding research.

Everything runs in your browser. No backend, no database, no telemetry. AI calls go from your browser direct to whichever provider you choose, with your BYOK key staying in `localStorage`. Open source under MIT. Same canonical 159 transformers feed both the SvelteKit app and the Python CLI, so adding one anywhere makes it available everywhere.

---

## Try it without installing

**[cryptex.m4xx.cfd](https://cryptex.m4xx.cfd)**. Full v2.0 instance, no signup, your BYOK key stays in your browser.

The hosted instance only serves the static bundle from a CDN. No server-side request logging, no analytics, no telemetry. Same code, same Docker image, same nginx config.

---

## Self-host in 30 seconds

```bash
docker run -d --name cryptex --restart unless-stopped \
  -p 8080:80 ghcr.io/m4xx101/cryptex-oss:latest
```

Open <http://localhost:8080>. Done.

The image is multi-arch (`linux/amd64` plus `linux/arm64`), so it pulls native on Intel and AMD Linux servers, Apple Silicon Macs, and Raspberry Pi.

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

`docker compose up -d` and you are done. The repo's own `docker-compose.yml` is Dokploy-tuned with Traefik labels for HTTPS plus Let's Encrypt. See [`DEPLOY.md`](DEPLOY.md) for that path.
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

Prereqs: Node 20.19+ or 22.12+ (not plain “Node 20”), npm. Install deps in app/, then npm run dev.
Optional: [`uv`](https://docs.astral.sh/uv/) for the Python CLI.
</details>

<details>
<summary><strong>Production VPS deploy (Dokploy + Let's Encrypt)</strong></summary>

The committed `docker-compose.yml` is Dokploy-first. It joins the external `dokploy-network` and ships full Traefik routing labels for HTTPS plus Let's Encrypt cert issuance. Five-minute setup against Hostinger, Contabo, or any VPS.

Step-by-step in [`DEPLOY.md`](DEPLOY.md). Covers Dokploy install, DNS, env vars, cert troubleshooting, and a `docker run` plain-Docker variant.
</details>

Need a subpath? Build with `BASE_PATH=/cryptex` to serve at `/cryptex/...` instead of `/`.

---

## Use it on your phone

The app is responsive. Just visit the URL on mobile and add to home screen for one-tap launch. The full feature set works on iOS Safari and Chrome Android, including the BYOK gateway and all 25 tool surfaces.

For private personal hosting reachable from your phone anywhere: run the Docker image on a Raspberry Pi or any home box, then expose it through Tailscale Funnel or Cloudflare Tunnel. Your phone reaches your self-hosted instance over HTTPS with zero port-forwarding and no public DNS exposure.

---

## Host it for free

Five paths, all free for a Cryptex-scale static site:

| Platform | What to set | Free tier covers this |
|---|---|---|
| **GitHub Pages** | Fork the repo, Settings -> Pages -> Source: GitHub Actions | Yes, no limits for static |
| **Cloudflare Pages** | Connect repo. Build: `cd app && npm ci && npm run build`. Output: `app/build` | Yes, unmetered bandwidth |
| **Vercel** | Same build settings as Cloudflare Pages | Yes for personal |
| **Netlify** | Same build settings | Yes for personal |
| **Render** | Static site, same settings | Yes |
| **Raspberry Pi at home** | `docker run` the `linux/arm64` image. Reach from your phone via Tailscale Funnel. | Zero monthly cost beyond electricity |

Cryptex never phones home. Your hosted instance is your own.

---

## Cryptex Production

Same 159 transforms, 25 surfaces, 309 vault seeds, and BYOK gateway live at <https://cryptex.m4xx.cfd>. The hosted variant adds three things the OSS variant deliberately leaves out:

- **Chat playground.** Full multi-turn conversation against any configured provider. Streams responses. Attach images and PDFs. Sticky system prompts. Per-conversation token-cost chip. The chat surface is a product, not a tool; it lives at the hosted URL.
- **Attack-chain transforms inside chat.** Select any text in any chat turn (yours or the assistant's). Pipe it through the mutator pipeline (`layered_mutation`, `multi_layer_attack`, `best_of_k`, or any of the 36 mutators). The transformed text either replaces the selection or sends as a new turn. Build attacks iteratively against a target you are already in conversation with.
- **Unrestricted model presets.** Pre-configured pointers at uncensored, abliterated, and community-fine-tuned Llama-class and Mistral-class models on permissive providers. No setup, no key wrangling. Pick the preset and go.

If your work needs the chat surface or the live in-conversation mutator pipeline, that is the variant. Free, no signup, your BYOK key stays in your browser.

---

## Recipes

[`docs/USAGE.md`](docs/USAGE.md) is the offensive cookbook. Twelve worked recipes covering target fingerprinting, three-layer kneel stacks (bijection + PAP + GCG), many-shot capstones, Crescendo, OCR stego injection, indirect-injection via webpage summary, tool-call hijack, glitch-token derailment, TAP for SOTA targets, multi-layer composites, watermark forensics, and cross-model bake-offs. Includes the Defense Fingerprinter evidence table so you can recognize a target's defense family by eye, plus a cross-tool composability map showing which tool's output naturally feeds which.

---

## Tools

### Technique workbenches (10)

| Route | What it does |
|---|---|
| **Transform** | 159 encoders and decoders. Encode plus decode. Options per transform. Chainable. |
| **Decode** | Universal decoder. Paste anything, every detector ranks by confidence plus priority. |
| **Emoji** | Steganography via Unicode variation selectors, tag block, and combining marks. |
| **Gibberish** | Seeded dictionary-mapped gibberish plus batch letter-removal puzzle generation. |
| **Tokenizer** | Visualize segmentation under UTF-8, naive-word, or GPT BPE encoders. |
| **Tokenade** | Parameterized token-bomb payload builder (depth x breadth x repeats). |
| **Bijection** | Character-substitution alphabets: char to num, symbol, hex, emoji, Greek. |
| **Fuzzer** | 11 mutation strategies. Zero-width, Unicode noise, casing, Zalgo, homoglyph, grammar, synonym, prompt-injection, structured-noise. |
| **PromptCraft** | All 36 mutators plus the 4 multi-step orchestrators (TAP, PAIR, Crescendo, Many-Shot) with home-rolled SVG visualization. |
| **Anti-Classifier** | N-variant paraphrase fan-out with 5-feature heuristic evasion scoring. No external API calls. |

### Red-team labs (15)

`AdvSuffix` · `Glitch Tokens` · `OCR Injection` · `Markdown Exfil` · `Probe Lab` · `Cross-Model Diff` · `Replayer` · `Tool Result Lab` · `Indirect Injection` · `HarmBench` · `StrongREJECT` · `JBB` · `Fingerprinter` · `Watermark` · `PDF Injection`

Every benchmark lab carries a yellow "Heuristic scoring, not paper-accurate" banner. Scoring uses regex plus LLM-judge approximations of the published rubrics, not the original trained classifiers. Use it for craft signal and iteration, not as a vendor verdict.

### Vault drawers (309 seeds)

Every tool with a curated payload set ships a collapsible Vault drawer at the bottom. 96 glitch tokens, 38 adversarial suffixes, 40 indirect-injection patterns, 17 tool-result fixtures, 20 PromptCraft chains, 50 fuzzer seeds, 15 emoji carriers, plus per-benchmark customs. Add your own through the drawer.

License posture is hard-locked: MIT, CC0, CC-BY-4.0, or Apache 2.0. No GPL, AGPL, CC-BY-SA, or CC-BY-NC. Per-source provenance in [`app/src/lib/vault/LICENSES.md`](app/src/lib/vault/LICENSES.md).

---

## AI providers (BYOK)

Cryptex never sees your key. Paste it in Settings. It goes to `localStorage` only. Every AI call is direct browser to provider.

- **OpenRouter** (default, CORS-open). Single key, 200+ models.
- **Anthropic direct** via the `anthropic-dangerous-direct-browser-access` header.
- **OpenAI-compatible endpoints**: Groq, Together, Fireworks, DeepInfra, Cerebras, SambaNova, plus custom.
- **Local providers, no key needed**: Ollama, LM Studio, vLLM, llama.cpp, Llamafile, NVIDIA NIM. Point at the local URL (`http://localhost:11434`, etc.) and Cryptex skips the key requirement.

Direct OpenAI and Google Gemini are not supported from the browser (no CORS). Route those models through OpenRouter.

In dev mode (`npm run dev`), Vite mounts a `/api/_proxy/<providerId>/...` server-side passthrough so `/v1/models` works for every provider regardless of CORS. Production static deploys go direct; per-preset `defaultModels` lists in `app/src/lib/ai/presets.ts` cover any `/models` endpoints that block CORS.

---

## Architecture

```
cryptex-oss/
├── app/                          SvelteKit 2 + Svelte 5 + Tailwind + shadcn-svelte
│   └── src/
│       ├── routes/               25 tool routes plus /history + about / guide / settings
│       └── lib/
│           ├── ai/               Multi-provider gateway plus adapters (lazy-imported)
│           ├── techniques/       Mutators, classifiers, composites, modes
│           ├── transformers/     Vite-side transformer registry + universal decoder
│           ├── tools/            localStorage tool state (cryptex.toolStates)
│           ├── stego/            Three-mode emoji steganography engine
│           ├── workers/          Module workers (runInWorker dispatcher)
│           ├── errors/           CryptexError taxonomy + errorLogger + ErrorPanel
│           ├── history/          Hybrid localStorage + IndexedDB store
│           ├── vault/            Per-tool seed loader + store + LICENSES.md
│           ├── redteam/          All benchmark scorers plus payload libraries
│           └── components/       tools/ + redteam/ + shell (ToolShell, HistoryFooter)
├── src/transformers/             159 transformer modules (single source of truth)
├── cryptex_cli/                  Python CLI (shells out to Node)
├── scripts/cli_bridge.js         Node bridge for the Python CLI
├── Dockerfile + nginx.conf       Multi-stage build + strict CSP
├── docker-compose.yml            Dokploy-tuned (Traefik + Let's Encrypt)
└── .github/workflows/docker.yml  Multi-arch GHCR publish
```

Key design notes:

- **One source of truth for transforms.** `src/transformers/` feeds both the Svelte app (Vite `import.meta.glob`) and the Python CLI (Node sandbox in `scripts/cli_bridge.js`). No duplication.
- **No backend, no database, no auth.** Everything is browser-local. `cryptex.toolStates`, `cryptex.providers`, and per-tool prefs all live in `localStorage`. Vault items persist under `cryptex.vault.<toolId>`; history v2 uses a hybrid localStorage index plus IndexedDB payload with a localStorage fallback.
- **Strict CSP.** The production nginx config allows `connect-src` only to providers you have enabled. No third-party scripts, no CDNs, no analytics.
- **Web Workers for heavy transforms.** `app/src/lib/workers/runInWorker.ts` auto-dispatches: under 50 KB stays in-thread, 50 KB to 1 MB runs in a pool of 4 module workers, over 1 MB is rejected with a typed `Errors.badInput`. AbortController cancellation via `worker.terminate()`.
- **Typed error taxonomy.** `app/src/lib/errors/types.ts` ships a discriminated `CryptexError` union (network, cors, auth, provider, rate_limit, bad_input, tool, worker, storage_quota, local_server_offline, unknown). `errorLogger.report()` funnels everything to toast, history, and console.
- **Persistent history with replay.** `/history` global route plus per-tool `HistoryFooter` surface every run searchable across input, output, annotation. Pin, annotate, replay. Auto-prune at 4 MB soft cap.

---

## Python CLI

The Python CLI reuses the same 159 transformers as the web app via a Node bridge.

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
3. Pick a `priority` (1 to 310) using the guide at the bottom of `BaseTransformer.js`.
4. Run `npm run build` from the repo root.
5. Add coverage to `tests/test_universal.js`.

Auto-discovered. Web app, CLI, and tests pick it up.

### Add a tool surface

1. Create the Svelte component in `app/src/lib/components/tools/<tool>/` (or `app/src/lib/components/redteam/<tool>/`).
2. Add the route at `app/src/routes/<tool>/+page.svelte`, wrapping the content in `<ToolShell toolId="…" title="…">`.
3. Register the tab in `app/src/lib/components/shell/TabRail.svelte`.
4. Optional: add a Vault drawer via `<VaultSection>` if the tool has a curated payload set. See [`CLAUDE.md`](CLAUDE.md) for the v2.0 conventions.

### Pre-PR checklist

```bash
cd app && npm run check && npx vitest run && npm run build
cd .. && npm run test:all
uv run cryptex-cli list
```

---

## License

MIT. See [`LICENSE`](LICENSE).

Cryptex OSS bundles small red-team corpora (glitch tokens, adversarial suffixes, indirect-injection patterns, tool-result fixtures, emoji carriers, fuzzer seeds, PromptCraft chains, plus a tiny WordNet subset) sourced from openly-licensed papers, community write-ups, and public-domain Unicode references. Every bundled item is MIT, CC-BY-4.0, or CC0. Per-source attribution lives in [`app/src/lib/vault/LICENSES.md`](app/src/lib/vault/LICENSES.md). No GPL, AGPL, CC-BY-SA, or CC-BY-NC material is bundled.

---
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/Tool-bar-dark.png">
    <img src="docs/Tool-bar.png" alt="Cryptex OSS" width="100%">
  </picture>
</p>
<p align="left">
  <strong>Live:</strong> <a href="https://cryptex.m4xx.cfd/?ref=github.com">cryptex.m4xx.cfd</a> 
  <br>
  <strong>Source:</strong> <a href="https://github.com/m4xx101/cryptex-oss">github.com/m4xx101/cryptex-oss</a> 
  <br>
  <strong>Recipes:</strong> <a href="docs/USAGE.md">docs/USAGE.md</a>
</p>
