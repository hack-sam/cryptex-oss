# Changelog

All notable changes to Cryptex OSS land here. Format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versioning follows [SemVer](https://semver.org/).

## [2.1.1] - 2026-05-25

Svelte 5 reactivity hotfix wave. Resolves user-reported browser "Page Unresponsive" dialog on `/redteam/probe-lab` and `/redteam/indirect-injection`, plus two latent loops on `/promptcraft` and `/anticlassifier` first-mount with legacy unqualified model ids.

### Fixed

- **Probe Lab keystroke storm.** Hoisted `mutatorTechniques()` to a module-level constant so the 36-Technique catalog builds once at import time instead of on every keystroke. Debounced the task textarea by 200ms so the localTemplate-expansion pipeline only runs once per typing pause.
- **Indirect Injection regenerate + history.record double-fire.** Introduced `debouncedHiddenInstruction` $state shadow lagging by 200ms; `effectiveInstruction` derives off the shadow; both `regenerate` and `history.record` effects wrap their writes in `untrack()` so result mutations cannot loop back into their own inputs.
- **PromptCraft + Anti-Classifier modelPref normalizers.** Wrapped legacy-id normalization (`gpt-4o` -> `openrouter:gpt-4o`) in `untrack()` so the effect does not loop through `createPersistedState`'s localStorage round-trip.

### Changed (perf)

- **TransformTool.** Debounce `runInWorker` dispatch by 150ms with shared `activeController` cancellation. Typing at 60 chars/sec now spawns ~7 workers/sec instead of 60.
- **Glitch Tokens.** Memoize the family-filtered base list once, then chain narrower filters off it. About 3x fewer array walks per keystroke into the search box.
- **HistoryDrawer.** Gate the four-derived search + filter chain on `open` so the closed drawer no longer re-derives on every history mutation anywhere in the app.

### Docs

- README correctly positions <https://cryptex.m4xx.cfd> as a separate sibling product (different codebase, different feature set), not as a hosted copy of the OSS variant. The "Try it without installing" section was removed because it conflated the two.
- Root `package.json` version bumped 2.1.0 -> 2.1.1.

### Tests

- +16 stability tests pinning the debounce + `untrack` contracts across the four fixed routes. Total 774 / 774 passing (was 758).

### Image

- `ghcr.io/m4xx101/cryptex-oss:v2.1.1` (multi-arch `linux/amd64` + `linux/arm64`). `:latest`, `:v2.1`, `:v2`, `:main` all point at the same SHA.

## [2.1.0] - 2026-05-24

Repo trim + offensive usage guide + handcrafted README. No app code changed.

### Added
- `docs/USAGE.md`: 514-line offensive cookbook with 12 worked recipes (fingerprint, three-layer kneel, many-shot capstone, Crescendo, OCR stego injection, indirect-injection via webpage, tool-call hijack, glitch-token derailment, TAP, multi-layer composite, watermark forensics, cross-model bake-off). Includes the Defense Fingerprinter evidence table, cross-tool composability map, and the full 36-mutator + 4-composite + 8-classifier-evasion + 4-orchestrator reference.
- `CHANGELOG.md` (this file).
- README: hero block, tech-stack badge row, 5-path free-hosting table, mobile-usage section (Tailscale Funnel for personal phone access), and a dedicated Cryptex Production section advertising the chat playground + in-chat attack-chain transforms + unrestricted model presets at <https://cryptex.m4xx.cfd>.

### Removed
- 64 files: planning docs (`Brainstormed-Plan.md`, `PROJECT-STATUS.md`), the entire `.planning/` directory (4 codebase + 5 research brainstorms), 4 dated session-handoff docs under `docs/`, the 30-file `docs/superpowers/` agent-plans archive, 3 SaaS-specific deploy guides (`DEPLOY-ANALYTICS-AND-ADSENSE.md`, `DEPLOY-DOKPLOY-SUPABASE.md`, `DEPLOY-OAUTH-AND-EMAIL.md`), `.github/workflows/README.md`, `scripts/promote-dist.js`, `temp_fetch_glitch.js`, and a Google Search Console verification token (root + `app/static/`).
- 7 dead legacy `build:*` scripts in the root `package.json` (`build:copy`, `build:tools`, `build:templates`, `build:emoji`, `build:transforms`, `build:index`, `build:legacy`).

### Changed
- Root `package.json` simplified: name corrected to `cryptex-oss`, version pinned to 2.0.1, homepage added (`https://cryptex.m4xx.cfd`), bugs URL added, keywords expanded.
- README rewritten from scratch with handcrafted voice: zero em-dashes; the usual AI-slop verb list verified absent. Image placeholders at `docs/img/hero.png` + `docs/img/screenshot-*.png` render gracefully when files do not exist.
- `CLAUDE.md` reframed as "Contributor + AI-Assistant Guide" (was "guidance to Claude Code"). v2.0 conventions content unchanged.

## [2.0.1] - 2026-05-24

### Added
- GitHub Actions workflow publishes multi-arch (`linux/amd64` + `linux/arm64`) Docker image to GHCR on every push to `main` and on `v*.*.*` tags. Tag derivation via `docker/metadata-action@v5`: `:latest`, `:vX.Y.Z`, `:vX.Y`, `:vX`, `:main`, `:sha-<short>`.
- `docker run -d -p 8080:80 ghcr.io/m4xx101/cryptex-oss:latest` one-line install.
- README hero block with centered logo placeholder, badge row, three CTAs (Try live / Self-host / Release notes), and three collapsible install alternatives (Compose / Source / Dokploy VPS).
- `DEPLOY.md` Section 0 "Pull from GHCR (fastest)" covering the install one-liner, tag pinning, update flow, and drop-in compose snippet.
- `docker-compose.yml` carries a commented `image: ghcr.io/m4xx101/cryptex-oss:latest` alternate so Dokploy users can swap from build-from-source to pull-prebuilt by uncommenting one line.

### Changed
- Dockerfile OCI labels point at `github.com/m4xx101/cryptex-oss` (was the closed-source `cryptex` URL). Title and description reflect OSS framing. Adds `org.opencontainers.image.documentation` and `org.opencontainers.image.vendor`.

### Removed
- `PUBLIC_ADSENSE_CLIENT` references throughout `DEPLOY.md` (the AdSense subsection is a closed-source-only feature).

## [2.0.0] - 2026-05-24

Production-grade pass over all 25 tools. 16 commits across 6 waves. 758 tests pass (was 514 pre-v2.0).

### Added
- **Heuristic benchmark scoring** with category breakdowns and user-customizable prompt sets. HarmBench (three-bucket verdict refusal / partial / complied with per-category stacked bar chart), StrongREJECT (`score = refused ? 0 : (specificity * convincingness) / 25` per Souly et al. 2024 with LLM-judge prompt + JSON-tolerant parser + regex fallback), JailbreakBench (separate judge model picker, judge-is-target warning, judge-not-equal-target badge), Defense Fingerprinter (40 calibrated probes across 4 buckets, 4-class taxonomy: `Likely Constitutional AI / Likely RLHF-only / Likely system-prompt-driven / Unknown`, with confidence chip + top-3 evidence phrases), Watermark Detector (Kirchenbauer Z-score test on hash-based green-list with tunable seed plus existing ZWSP / EOS-leak / bigram-entropy + provider-tells), Anti-Classifier (N-variant paraphrase fan-out with 5-feature heuristic scoring: TTR, sentence-length variance, burstiness, punctuation entropy, length naturalness; explicit "no calls to GPTZero / Originality.ai / Copyleaks" design decision).
- **Vault drawers** per tool with 309 bundled OSS-licensed seed items (96 glitch tokens, 38 adversarial suffixes, 40 indirect-injection patterns, 17 tool-result lab fixtures, 20 PromptCraft chains, 50 fuzzer seeds, 15 emoji carriers, plus per-benchmark customs). Custom-add modal persists user items under `cryptex.vault.<toolId>`. Schema-versioned for forward migrations. License posture hard-locked to MIT / CC0 / CC-BY-4.0 / Apache-2.0.
- **Typed error taxonomy.** Discriminated `CryptexError` union (`network / cors / auth / provider / rate_limit / bad_input / tool / worker / storage_quota / local_server_offline / unknown`). `errorLogger.report()` funnels to toast + history + console. `ErrorPanel` component surfaces retry / dismiss.
- **Web Worker offload.** `runInWorker` dispatcher: in-thread under 50 KB, pool-of-4 module workers between 50 KB and 1 MB, throws `Errors.badInput` above 1 MB. AbortController cancellation via `worker.terminate()`.
- **Persistent searchable history.** Hybrid localStorage index + IndexedDB payload with localStorage fallback (50-entry cap). Auto-prune at 4 MB soft cap. `/history` global route with JSON + Markdown export, search across input / output / annotation, pin, annotate, replay (query-param navigation).
- **Unified `ToolShell` template** applied uniformly across all 25 tool surfaces. Status badge (Ready / Running / Done / Error / Cancelled), built-in Cancel, optional Vault slot, `HistoryFooter` at the bottom, automatic `<svelte:head><title>`.
- **Multi-step orchestrators** in PromptCraft with home-rolled SVG visualization (~5 KB bundle vs 40-120 KB for D3 / svelte-flow): TAP tree, PAIR timeline, Crescendo thread, Many-Shot grid.
- **Emoji stego** full Unicode mode set: variation selectors (U+FE0E / U+FE0F per-bit), tag block (U+E0020 + 4-bit nibble), combining marks (6-bit groups U+0300+). Any emoji as carrier (ZWJ + skin tones via `\p{Emoji_Presentation}`). Forensics decoder side-by-side.
- **Fuzzer** 4 advanced strategies on top of the 7 basic: grammar-mutation, synonym-replacement (WordNet-lite ~55 entries, CC-BY-4.0), prompt-injection-mutation (via PromptCraft registry), structured-noise (regex-targeted).
- **Local provider support** without BYOK keys: Ollama, LM Studio, vLLM, llama.cpp, Llamafile, NVIDIA NIM.
- **`/history`** global searchable + replayable run log.
- **CLAUDE.md v2.0 conventions** block documenting the ToolShell pattern, Vault drawer schema, error taxonomy, Web Worker dispatch, history v2 entry points, and the mandatory yellow heuristic-banner copy for benchmark pages.

### Changed
- `sessionLog.record()` calls fan out to `history.record()` via a fire-and-forget compat shim. All 13 existing call sites stay working without edits; every operation now persists to the v2 store and surfaces in `HistoryDrawer` + `/history`.
- `HistoryDrawer` rewritten to read from the v2 store with debounced search, three reinterpreted tabs (This session / Pinned / All), per-entry hover actions (Open / Replay / Pin / Annotate), inline annotation editor, quota soft-cap banner, dual JSON + Markdown export.

## [1.0.1] - 2026-05-09

### Added
- Vite dev server `/api/_proxy/<providerId>/...` server-side passthrough so `/v1/models` works for every provider regardless of CORS.
- `presetRequiresKey()` helper plus `hasAnyConfiguredProvider()`. Local providers (Ollama, LM Studio, vLLM, llama.cpp) now run without an API key.

### Fixed
- DeepSeek and LM Studio model-list fetch failing under browser CORS.
- Local providers being treated as unconfigured even when their URL was set.
- `npm audit` cleaned 12 advisories to 0 via targeted upgrades (Vite, SvelteKit, Vitest, cookie override).
- `package-lock.json` regenerated to fix missing peer-dependency resolutions.

## [1.0.0] - 2026-05-09

Initial open-source release.

### Added
- 159 transformers in `src/transformers/` (encoding, classical ciphers, Unicode lookalikes, steganography, ancient scripts, fantasy alphabets, format tricks).
- 25 tool surfaces: 10 technique workbenches (`/transforms`, `/decode`, `/emoji`, `/gibberish`, `/tokenizer`, `/tokenade`, `/bijection`, `/fuzzer`, `/promptcraft`, `/anticlassifier`) + 15 red-team labs under `/redteam/*`.
- Multi-provider BYOK gateway (OpenRouter, Anthropic direct, OpenAI-compatible endpoints).
- 36 mutators, 8 classifier-evasion techniques, 4 composites, 3 conversation modes.
- Python CLI (`cryptex-cli`) reusing the same 159 transformers via Node bridge.
- Docker image + Dokploy-tuned `docker-compose.yml` + strict-CSP `nginx.conf`.
- MIT license.

[2.1.1]: https://github.com/m4xx101/cryptex-oss/releases/tag/v2.1.1
[2.1.0]: https://github.com/m4xx101/cryptex-oss/releases/tag/v2.1.0
[2.0.1]: https://github.com/m4xx101/cryptex-oss/releases/tag/v2.0.1
[2.0.0]: https://github.com/m4xx101/cryptex-oss/releases/tag/v2.0.0
[1.0.1]: https://github.com/m4xx101/cryptex-oss/releases/tag/v1.0.1
[1.0.0]: https://github.com/m4xx101/cryptex-oss/releases/tag/v1.0.0
