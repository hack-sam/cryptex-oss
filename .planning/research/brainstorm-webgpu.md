# WebGPU Local Models — 2026 Research

Research date: 2026-04-18
Author: Claude research agent for Cryptex
Scope: How to plug in-browser WebGPU LLM inference into Cryptex's BYOK gateway
so the chat UI can't tell a local model from OpenAI/Anthropic/OpenRouter.

Internal confirmation: Cryptex has zero local-model code today. The only
provider wired up is OpenRouter, via `app/src/lib/ai/openrouter.ts`
(`ChatRequest → ChatResponse` shape, `ChatMessage[]`, persisted BYOK key,
categorized `OpenRouterError`, live model catalog via `fetchModels()`). Any
local-model provider must conform to that call signature.

---

## 1. WebGPU browser matrix, April 2026

WebGPU "hit critical mass" in Q1 2026 — all four major engines now ship it on
at least their flagship desktop target. The matrix as of this writing:

| Engine | Desktop | Mobile | Flags needed | Notes |
|---|---|---|---|---|
| **Chrome 113+** / **Edge 113+** | Windows (D3D12), macOS (Metal), ChromeOS — on by default | Android 12+ with Qualcomm/ARM GPUs, Chrome 121+ | None on desktop; none on supported Android | Linux still uses `--enable-unsafe-webgpu` on most distros |
| **Firefox 141+** | Windows: on by default since 141. macOS on Apple Silicon: on by default since 145 | Not yet | None on supported desktops | Linux + Android: tracked for 2026, no firm date |
| **Safari 26 / iOS 26 / iPadOS 26 / visionOS 26** | macOS Tahoe 26 default on | iOS 26, iPadOS 26 default on | None | Earliest iOS release to ship WebGPU generally; very aggressive memory ceilings on iPhone (see §9) |
| **Legacy Chrome/Edge < 113** | — | — | — | Effectively zero share in April 2026 |

Global coverage sits near 80% in April 2026 per caniuse trajectory (was ~70%
in late 2024, +Safari iOS/iPadOS 26 in fall 2025, +Firefox desktop throughout
2025). The remaining ~20% is roughly: Linux Chrome without the flag, older
Android devices, Linux Firefox, and the long tail of embedded browsers.

**Practical meaning for Cryptex**: we can treat WebGPU as a progressive
enhancement tier. Detect `navigator.gpu` + `adapter.requestDevice()` at runtime
and only surface the "Local model" provider when both succeed. Fall back to
WASM-only (wllama) for the no-GPU tier, or just hide the provider entirely
for pre-113 browsers.

---

## 2. Runtime comparison

| Runtime | WebGPU maturity (Apr 2026) | Model support | Bundle size | Tool calls / structured output | Quant formats | OpenAI API shape | Cache backend | Verdict |
|---|---|---|---|---|---|---|---|---|
| **`@mlc-ai/web-llm` 0.2.8x** | Production — the reference browser LLM runtime. MLC/TVM compiles models to WebGPU WGSL | Llama 3 / 3.2 / 3.3, Phi 3 / 3.5 / 4, Gemma 2 / 3, Qwen 2 / 2.5, Mistral 7B v0.3, Hermes-2-Pro, SmolLM / SmolLM2 — prebuilt `.wasm` + weights hosted on HF | ~800 KB engine + model weights (300 MB – 8 GB) | **Native OpenAI API** incl. `stream`, `json_mode`, `response_format`, `logit_bias`, `seed`. `tools` / `tool_choice` marked "preliminary support" — usable but MLC recommends manual prompting for reliability. Grammar/JSON schema via XGrammar backend in the Structured Generation Playground | `q4f16_1`, `q4f32_1`, `q3f16_1`, `q0f16` (fp16 no-quant) | **Yes, 1:1** — `engine.chat.completions.create()` mirrors OpenAI | `AppConfig.cacheBackend`: `"cache"` (Cache API, default), `"indexeddb"`, `"cross-origin"` (chrome-extension experimental). OPFS is requested (issue #660) but not merged | **Primary pick for Cryptex.** Best ergonomics for a drop-in OpenAI-compatible local provider. |
| **`@huggingface/transformers` v4** (Transformers.js) | Production — v4 shipped Feb 9, 2026; WebGPU runtime completely rewritten in C++ with the ONNX Runtime team. ~200 architectures validated | Everything Transformers has adapters for: text-gen, embeddings, ASR, TTS, vision, multimodal. Added in v4: GPT-OSS, Chatterbox, GraniteMoEHybrid, LFM2-MoE, Olmo3, FalconH1, Youtu-LLM, Apertus. Supports >8B, e.g. GPT-OSS 20B at q4f16 | 53% smaller than v3 for `transformers.web.js`; ~10% overall. Tokenizers split out as standalone `@huggingface/tokenizers` (8.8 KB gzipped) | Not native — uses HF generation loops. Tool calls require prompt-level schemas + parsing. No first-class `response_format: json_schema` like WebLLM. Mamba / MoE / MLA architectures supported | `fp32`, `fp16`, `q4`, `q4f16` (queryable via `ModelRegistry.get_available_dtypes`) | Not natively — you build a `chat()` function on top of `pipeline('text-generation')` or `AutoModelForCausalLM` + `TextStreamer` | IndexedDB by default via HF Hub cache. No explicit OPFS switch | **Secondary pick, especially for embeddings + non-text models.** Broader model zoo but more glue code to hit "chat completions" parity. |
| **`@wllama/wllama`** (llama.cpp WASM) | CPU-only (WASM + SIMD + pthreads). GPU path is planned via WebGL (not WebGPU yet) | Any GGUF; weights can be split with `--gguf-split` so each chunk is <2 GB (required for the WASM 4 GB heap) | ~600 KB WASM binary + GGUF weights. Needs COOP/COEP for `SharedArrayBuffer` (threads) | Grammar files (GBNF) work since llama.cpp supports them server-side; same grammars load in wllama | q2_K through q8_0, including `Q4_K_M` that people actually want | OpenAI-ish but minimal: `createCompletion`, `createEmbedding`. Needs an adapter | IndexedDB via the OPFS-like abstraction shipped with llama.cpp | **Fallback for the no-WebGPU tier.** CPU-only tok/s will be painful for >1 B models, but keeps Firefox Linux / older Android usable. |
| **ONNX Runtime Web 2026** (`onnxruntime-web`) | Production. This is what Transformers.js v4 uses under the hood | Any ONNX model. For LLMs you'd typically use HF ONNX exports | ~500 KB for WebGPU EP, ~1.5 MB for full WASM EP | You write your own loop. No tool-call UX. | All ONNX quant ops (INT8, INT4 via `MatMulNBits`, FP16 via `GroupQueryAttention`) | No — it's a tensor runtime | Consumer's problem (Cache API or OPFS as you wish) | **Too low-level for us.** Useful only if we ever need a bespoke non-LLM ONNX model. |
| **Candle-wasm** (Rust/HF) | Active but niche for text-gen. WebGPU path is rougher than WebLLM's | Has specific demos (Phi-1.5, Mistral, Whisper, SAM). Not the zoo Transformers.js ships | ~2–4 MB WASM per model build (one WASM per model arch) | None native | Model-build-time | No | Custom | **Skip for Cryptex.** More code, smaller zoo, less mature WebGPU than WebLLM. |
| **Burn** (Rust) | Burn has a WebGPU backend (`wgpu`) and runs in the browser via WASM; as of 2026 the LLM story is thin — Burn targets training + general ML more than "download this Llama quant and run it" | Up to you to build | Variable | None | Any | No | Custom | **Skip.** Great framework, not a drop-in local-LLM runtime. |

**Observations:**
- WebLLM and Transformers.js both ultimately lean on WebGPU compute shaders.
  WebLLM uses MLC-LLM's TVM-compiled kernels with hand-tuned WGSL; Transformers.js
  v4 leans on ONNX Runtime Web's WebGPU EP. WebLLM tends to be faster on models
  it has prebuilt; Transformers.js wins on model variety.
- Only WebLLM ships a true OpenAI Chat Completions surface. For Cryptex that
  matters because the whole gateway assumes that shape.
- Cache backends are uniformly weak: IndexedDB or Cache API. OPFS is the right
  answer for multi-GB weights (stream-based reads, no blob serialization), and
  WebLLM has an open issue (#660) to add it. For Cryptex we'll adopt Cache API
  now with a documented migration path to OPFS when upstream lands it, or we
  write an OPFS `cacheBackend` ourselves.

---

## 3. Recommended runtime(s) for Cryptex

**Primary: `@mlc-ai/web-llm` (WebLLM) behind a `LocalProvider` adapter.**

Reasons:
1. Native OpenAI-shape API (`engine.chat.completions.create`) — adapter is
   trivial because the surface already matches our `ChatRequest`.
2. Prebuilt library of sensible small models (Llama 3.2 1B/3B, Phi 3.5 mini,
   Gemma 2 2B, Qwen 2.5 0.5B/1.5B/3B/7B, SmolLM2 360M/1.7B) — no model
   conversion step for us.
3. WebWorker + ServiceWorker variants (`WebWorkerMLCEngine`,
   `ServiceWorkerMLCEngine`) so inference never blocks the UI thread or the
   Svelte runtime.
4. `response_format: json_schema` via XGrammar — gives us structured output
   for the same transforms we already use for tool-calling UX with OpenRouter.
5. Progress-callback API matches the UX Cryptex already uses for multi-step
   transforms.

**Fallback: `@wllama/wllama` for no-WebGPU browsers.**

Reasons:
1. Keeps Linux Chrome (without the unsafe flag), Linux Firefox, older Android
   usable at least for the smallest models (SmolLM2 360M, Gemma 3 270M).
2. GGUF files are widely available — no conversion step.
3. Shares the "local provider" adapter shape; difference is internal.

**Skip for now:** Transformers.js v4 as a chat backend (we'd re-implement what
WebLLM gives us for free). **Keep** Transformers.js in the back pocket for
non-chat tasks if we later want local embeddings, ASR, or TTS — it's the
right tool for those.

---

## 4. Realistic model shortlist for 2026 browsers

Weights below are for 4-bit quant (`q4f16_1` for WebLLM, `Q4_K_M` for GGUF).
VRAM figures include KV cache headroom at 4 K context (double for 8 K).
tok/s ranges come from WebLLM / Transformers.js benchmarks pooled across the
sources cited at the end.

| Model | Params | Download | Runtime VRAM | M2 Air (tok/s) | M4 Pro Max (tok/s) | RTX 4060 (tok/s) | RTX 4090 (tok/s) | Integrated iGPU (tok/s) | Good for |
|---|---|---|---|---|---|---|---|---|---|
| **Gemma 3 270M** | 270 M | ~170 MB | ~400 MB | 120–180 | 220–280 | 140–200 | 300+ | 40–60 | Autocomplete, classification. Too small for real conversation. |
| **SmolLM2 360M Instruct** | 360 M | ~230 MB | ~500 MB | 100–150 | 180–240 | 120–170 | 280+ | 35–55 | Tiny chat, summarisation of short passages. |
| **SmolLM3 1.7B** | 1.7 B | ~1.0 GB | ~1.4 GB | 55–80 | 110–150 | 65–90 | 170+ | 18–30 | Lightweight chat with 128 K context via YARN. |
| **Llama 3.2 1B Instruct** | 1.2 B | ~750 MB | ~1.1 GB | 60–90 | 120–160 | 70–100 | 180+ | 20–35 | Minimum viable conversational floor. |
| **Qwen 2.5 1.5B Instruct** | 1.5 B | ~950 MB | ~1.3 GB | 50–75 | 100–140 | 60–85 | 160+ | 18–30 | Strong multilingual small-model. |
| **Phi 3.5 mini 3.8B** | 3.8 B | ~2.3 GB | ~3.0 GB | 30–45 | 70–95 | 40–55 | 110+ | 10–18 | Sweet-spot quality vs. size for browsers. |
| **Llama 3.2 3B Instruct** | 3.2 B | ~2.0 GB | ~2.7 GB | 35–50 | 80–110 | 45–60 | 130+ | 12–20 | Our "default" target. |
| **Gemma 3 4B** | 4.3 B | ~2.6 GB | ~3.3 GB | 28–42 | 65–90 | 38–52 | 100+ | 10–17 | Good English quality, vision variants exist. |
| **Qwen 2.5 7B Instruct** | 7.6 B | ~4.6 GB | ~5.8 GB | 15–25 | 40–60 | 25–35 | 75+ | 6–10 | "Power user" tier; won't fit iPhone WebGPU. |
| **Llama 3.3 8B Instruct** | 8 B | ~5.0 GB | ~6.4 GB | 12–20 | 35–55 | 22–32 | 70+ | 5–9 | Still reasonable on 4060, tight on 6 GB cards. |
| **Phi-4 14B** | 14 B | ~8.5 GB | ~10 GB | OOM | 18–30 | OOM on 8 GB | 45–60 | OOM | Ambitious; only for 4080/4090-class GPUs. |
| **GPT-OSS 20B** (Transformers.js v4) | 20 B | ~11 GB | ~13 GB | OOM | ~60 (cited) | OOM | 30–45 | OOM | Research upper bound for in-browser. |

**Default recommendation for Cryptex:** ship a picker with three tiers:

- **Tiny** (default on mobile / first visit): `SmolLM2-360M-Instruct-q4f16_1-MLC` — 230 MB download, usable everywhere WebGPU works.
- **Balanced** (default on desktop after first run): `Llama-3.2-3B-Instruct-q4f16_1-MLC` — 2.0 GB, good general quality, fits comfortably on 6 GB+ GPUs.
- **Power** (opt-in): `Qwen2.5-7B-Instruct-q4f16_1-MLC` or `Phi-3.5-mini-instruct-q4f16_1-MLC` — for users who explicitly accept the 4–5 GB download.

**Do not** auto-download multi-GB models. §7 handles that UX.

---

## 5. Weight caching strategy

Storage backends ranked for multi-GB model weights (based on Chrome's own
"Cache AI models" guidance and OPFS benchmarks, with WebLLM #660 open to add
OPFS support):

| Backend | Max size | Serialize on read/write? | Persistence | Verdict |
|---|---|---|---|---|
| **OPFS** (Origin Private File System) | Browser quota (~60% of free disk on Chrome; ~1 GB hard cap on iOS WebKit as of iOS 26) | No — stream-based file handles | Survives reloads, cleared on site-data clear | **Ideal for >1 GB models.** No deserialization cost on load. iOS is the pain point. |
| **Cache API** | Browser quota (same rules) | Stored as `Response` objects, minimal serialization | Same | **Good default.** WebLLM's default. Works everywhere. ~10–15% slower warm loads than OPFS. |
| **IndexedDB** | Browser quota | Yes, both directions (blob + structured clone) | Same | **Avoid for large weights.** Measured 1.3 GB model takes ~23 s cold, ~2.3 s warm from OPFS vs. much worse from IDB. |

**Cryptex strategy:**

1. **Today**: use WebLLM's `AppConfig.cacheBackend: "cache"` (Cache API). Widely
   supported, no custom shim needed. Warm reloads are acceptable (< 5 s for a
   3 B model on typical SSDs).
2. **When WebLLM adds OPFS** (issue #660 is active): switch to OPFS. Plan a
   one-time migration that, on first load after the switch, copies Cache API
   entries into OPFS in the background and then evicts the Cache entry.
3. **Quota & consent**: call `navigator.storage.estimate()` before offering a
   model. If `quota - usage < model_size * 1.25`, block the download and show
   a "Free up disk space" message.
4. **Request persistence**: call `navigator.storage.persist()` after the user
   explicitly confirms the download. Otherwise Chrome will evict the Cache API
   entry under storage pressure.
5. **Cache busting**: WebLLM keys cache entries by model URL + shard hash, so
   model updates naturally invalidate. We expose a "Clear cached models"
   button in Settings that calls `engine.unload()` then iterates
   `caches.delete()` for the WebLLM namespace.
6. **No cross-origin sharing** — browser sandboxing prevents cache sharing
   across origins. If the user visits Cryptex's dev, staging, and prod origins,
   each gets its own model cache. Nothing we can do except document it.

---

## 6. Provider-adapter sketch

Cryptex's OpenRouter adapter exports these from `app/src/lib/ai/openrouter.ts`:

- `ChatMessage`, `ChatRequest`, `ChatResponse` types
- `chat(req: ChatRequest): Promise<ChatResponse>`
- `hasApiKey()`, `getApiKey()`, `setApiKey()`, `validateKey()`
- `fetchModels()`, `FALLBACK_MODELS`, `Model` type
- `OpenRouterError` with `ErrorCategory` union

The local provider should mirror every one of those signatures. Sketch:

```ts
// app/src/lib/ai/local.ts  (NEW)
import * as webllm from '@mlc-ai/web-llm';
import type { ChatMessage, ChatRequest, ChatResponse } from './types';

// ----- capability detection -----
export async function isAvailable(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    await adapter.requestDevice();
    return true;
  } catch {
    return false;
  }
}

// ----- engine lifecycle -----
let engine: webllm.WebWorkerMLCEngine | null = null;
let currentModelId: string | null = null;
let loadPromise: Promise<void> | null = null;

export type LocalProgress = {
  phase: 'fetch' | 'compile' | 'ready';
  loaded: number; // 0..1
  text: string;  // human-readable (e.g. "Downloading q4f16 shard 3/12")
};

export async function loadModel(
  modelId: string,
  onProgress?: (p: LocalProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  if (currentModelId === modelId && engine) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Unload previous engine to free GPU memory (§9).
    if (engine) { await engine.unload(); engine = null; currentModelId = null; }

    const worker = new Worker(
      new URL('./local-worker.ts', import.meta.url),
      { type: 'module' }
    );

    engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: (report) => {
        onProgress?.({
          phase: report.progress < 1 ? 'fetch' : 'compile',
          loaded: report.progress,
          text: report.text
        });
      },
      appConfig: { ...webllm.prebuiltAppConfig, cacheBackend: 'cache' }
    });

    currentModelId = modelId;
    onProgress?.({ phase: 'ready', loaded: 1, text: 'Ready' });
    signal?.throwIfAborted();
  })();

  try { await loadPromise; } finally { loadPromise = null; }
}

export async function unloadModel(): Promise<void> {
  if (!engine) return;
  await engine.unload();
  engine = null;
  currentModelId = null;
}

// ----- chat, shaped exactly like openrouter.chat() -----
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  if (!engine) throw new LocalError('No model loaded. Pick a model first.', 'no_model');
  const completion = await engine.chat.completions.create({
    messages: req.messages,
    temperature: req.temperature,
    top_p: req.top_p,
    max_tokens: req.max_tokens,
    stream: false,
    // Optional structured output if the caller wants it; pass through untouched.
    // response_format: req.response_format
  });
  const first = completion.choices?.[0];
  const content = first?.message?.content?.trim() || '';
  if (!content) throw new LocalError('Empty response from local model.', 'api');
  return {
    content,
    rawModel: currentModelId ?? req.model,
    finishReason: first?.finish_reason,
    usage: completion.usage
  };
}

// ----- streaming variant (used by chat UI) -----
export async function* chatStream(req: ChatRequest): AsyncGenerator<string> {
  if (!engine) throw new LocalError('No model loaded.', 'no_model');
  const chunks = await engine.chat.completions.create({
    messages: req.messages,
    temperature: req.temperature,
    stream: true,
    stream_options: { include_usage: true }
  });
  for await (const chunk of chunks) {
    if (req.signal?.aborted) { await engine.interruptGenerate(); return; }
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ----- errors matching OpenRouterError contract -----
export type LocalErrorCategory =
  | 'no_webgpu' | 'no_model' | 'load_failed' | 'oom' | 'aborted' | 'api';
export class LocalError extends Error {
  readonly category: LocalErrorCategory;
  constructor(message: string, category: LocalErrorCategory) {
    super(message); this.name = 'LocalError'; this.category = category;
  }
}

// ----- static model catalog (mirrors FALLBACK_MODELS) -----
export const LOCAL_MODELS = [
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', name: 'SmolLM2 360M (tiny)',  tier: 'tiny',     sizeMB: 230 },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B',         tier: 'tiny',     sizeMB: 750 },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B',         tier: 'balanced', sizeMB: 2000 },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 mini (3.8B)',  tier: 'balanced', sizeMB: 2300 },
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',   name: 'Qwen 2.5 7B',          tier: 'power',    sizeMB: 4600 }
] as const;
```

Then at the gateway level we wrap both providers behind a single router:

```ts
// app/src/lib/ai/gateway.ts  (NEW — small)
import * as openrouter from './openrouter';
import * as local from './local';
import type { ChatRequest, ChatResponse } from './types';

export type ProviderId = 'openrouter' | 'local';

export async function chat(providerId: ProviderId, req: ChatRequest): Promise<ChatResponse> {
  if (providerId === 'local') return local.chat(req);
  return openrouter.chat(req);
}

export async function *chatStream(providerId: ProviderId, req: ChatRequest) {
  if (providerId === 'local') { yield* local.chatStream(req); return; }
  // OpenRouter streaming lands in a separate phase; fall back to non-stream for now.
  const r = await openrouter.chat(req);
  yield r.content;
}
```

The chat UI imports only from `gateway.ts`. It never needs to know whether the
model is local or remote. Adding Anthropic or native OpenAI later is a matter
of adding another case in the same switch.

### 6.1 Prior art for "local-as-OpenAI-endpoint" browser shims (2026)

There are server-side shims (Ollama, LM Studio, vLLM) that expose local
models as OpenAI endpoints — but those run outside the browser. In-browser,
WebLLM's `engine.chat.completions` IS the shim; there's no separate "OpenAI
endpoint emulator" in the browser because there's no HTTP loopback. The
pattern we adopt above (adapter module mirroring OpenAI shape) is what every
2026 BYOK browser app using WebLLM does — Mozilla AI's "3W for In-Browser AI"
writeup and Refactory's browser-LLM coaching-feature writeup both follow the
same pattern.

---

## 7. UX flow: first-run download, model picker, progress, cancel, clear-cache

Principles:
- **No surprise multi-GB downloads.** Explicit confirmation with size.
- **Progress is honest.** Show shards downloaded / compiled.
- **Cancellable.** `AbortSignal` flows all the way to WebLLM.
- **Resumable.** Cache API / OPFS already handles partial shards — WebLLM
  skips re-downloading anything cached.
- **Clearable.** Settings exposes cache size and a "Clear cached models" button.

### First-run flow

```
[ User opens Cryptex AI tab ]
         │
         ▼
[ gateway.ts: probe local.isAvailable() ]
         │
    ┌────┴────────────────────────────┐
    │WebGPU ok                         │No WebGPU (or blocked)
    ▼                                  ▼
[ Show provider segmented control:   [ Hide "Local" segment; show only
  (•) OpenRouter   ( ) Local ]         OpenRouter and a tooltip: "Local
                                       models need WebGPU — not available
                                       in this browser." ]
```

If the user clicks "Local" for the first time:

```
[ Modal: "Run models on your device" ]
  - Explainer: models download once (X MB), then run offline.
  - Pick a tier:
       ◎ Tiny (SmolLM2 360M, 230 MB)       — fastest, OK for short tasks
       ○ Balanced (Llama 3.2 3B, 2.0 GB)   — recommended
       ○ Power (Qwen 2.5 7B, 4.6 GB)       — slow first load, best quality
  - Quota check (navigator.storage.estimate):
       "You have 42 GB free. This model needs ~4 GB."  (green ✓)
       or
       "You have 1.2 GB free. Not enough for Balanced." (red ✗, disabled)
  - [ Cancel ]  [ Download and load ]
```

After confirm:

```
[ Download progress ]
  ● Fetching weights — shard 5 of 18 (1.1 / 4.0 GB, 12 MB/s, ETA 4m)
  ○ Compiling WGSL kernels
  ○ Warming up

  [ Cancel ]     (keeps partial downloads in cache)
```

Once loaded:

```
[ Chat UI exactly as today, with a small badge: "Local · Llama 3.2 3B · 42 tok/s"
  next to the send button. Click to open the model picker. ]
```

### Settings page additions

```
Local models
  Currently loaded:   Llama 3.2 3B  [Unload]
  Cached models:      3 of 5 (2.9 GB used)
    ☑ SmolLM2 360M         230 MB    [Delete]
    ☑ Llama 3.2 1B         750 MB    [Delete]
    ☑ Llama 3.2 3B         2.0 GB    [Delete]

  [ Clear all cached models ]

  Tips
  • Local models never leave your device.
  • Switching browsers or clearing site data removes cached weights.
```

### Cancel / interrupt during inference

WebLLM exposes `engine.interruptGenerate()` — wire it into the same `Stop`
button we already have for OpenRouter. On click: call `interruptGenerate()`
immediately, then let the stream finalize naturally.

### What NOT to do

- Don't auto-download on page load.
- Don't preload any model by default.
- Don't re-prompt consent every visit — once the model is cached the user
  opted in once, that's enough.

---

## 8. Security + privacy notes

### Side-channel / fingerprinting
- **WebGPU-SPY** (arXiv 2401.04349, Ferguson & Wilson) demonstrated GPU-cache
  side-channel attacks from WebGPU compute shaders — both keystroke/website
  fingerprinting of other tabs and a reliable device-fingerprint signal.
  Mitigations are at the browser level; apps can't prevent it. Users who care
  should not enable WebGPU on untrusted origins.
- **GPUBreach** (ETH Zurich + Georgia Tech, publicly reported April 2026) —
  malicious WebGPU shader extracts KASLR offsets on Linux hosts in ~14 s via
  CPU-GPU cache interactions. Any app running WebGPU on a page the user
  trusts is not the threat vector; the threat is untrusted third-party pages.
- **CVE-2026-5281** (Chromium Dawn) — use-after-free in WebGPU exploited in
  the wild; CISA KEV on April 1 2026. Users should keep Chrome ≥ latest
  stable. Nothing we can code around.
- **CVE-2025-12725** — WebGPU bounds-checking flaw, patched in Chrome stable
  Q4 2025. Same guidance.

**Implication for Cryptex:** the mere act of running a WebGPU model
marginally increases device fingerprinting surface area (GPU/driver strings
are already exposed via `adapter.requestAdapterInfo()` even without running a
shader). Disclose this in the privacy blurb:

> "Local models use WebGPU, which exposes your GPU model and driver version
> to this page. Your prompts and responses never leave your device."

### Headers
- **COOP / COEP**: required for `SharedArrayBuffer`. WebLLM itself runs fine
  without COOP/COEP (uses `Atomics.wait` + WebGPU), but **wllama** needs
  `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
  require-corp` for its pthread path. If we add wllama fallback, static host
  needs to serve those headers. Our deploy already runs behind Traefik so
  this is a labels change, not a code change.
- **CSP**: WebLLM downloads weights from HF CDN (`huggingface.co`,
  `cdn-lfs.huggingface.co`) — whitelist those in `connect-src`. It also
  loads WASM — `wasm-unsafe-eval` must be in `script-src`. Document in
  `DEPLOY.md`.

### BYOK is moot for local — but key leakage for other providers isn't
Cryptex stores the OpenRouter key in `localStorage`. If we later add native
OpenAI / Anthropic providers, those keys should use the same persisted-store
pattern (`createPersistedState`). For local models there's no key and nothing
to leak — that's the whole point.

### No server, no logs
Unlike the OpenRouter path, the local path never hits a backend. No request
appears in the network tab after the initial model download. Worth calling
out to privacy-minded users.

### iOS sandbox note
Safari on iOS enforces a ~1 GB origin quota (variable by device). Anything
bigger will fail silently at download time. Cap the model picker on iOS to
the "tiny" tier (≤ 750 MB).

---

## 9. Perf honesty (tok/s expectations)

Numbers to quote to users, rounded and conservative. Source: WebLLM benchmarks,
Transformers.js v4 release blog (M4 Pro Max GPT-OSS 20B @ 60 tok/s with q4f16),
buildmvpfast.com WebGPU inference writeup (180 tok/s Qwen 3.5 INT4 with
hand-tuned kernels — that's a best case), localaimaster guides, and scrape of
Refactory + Mozilla AI writeups.

**TL;DR per tier on typical hardware:**

| Device class | Tiny (360 M) | Balanced (3 B) | Power (7 B) |
|---|---|---|---|
| Apple M1 / M2 Air | 100–180 tok/s | 35–50 tok/s | 15–25 tok/s |
| Apple M3 / M4 | 150–250 tok/s | 55–90 tok/s | 25–45 tok/s |
| Apple M4 Pro / Max | 220–280 tok/s | 80–110 tok/s | 40–60 tok/s |
| NVIDIA RTX 4060 (laptop 8 GB) | 120–200 tok/s | 45–60 tok/s | 25–35 tok/s |
| NVIDIA RTX 4070 / 4080 | 200–280 tok/s | 70–95 tok/s | 45–60 tok/s |
| NVIDIA RTX 4090 | 280+ tok/s | 130+ tok/s | 75+ tok/s |
| Intel Arc iGPU (Meteor/Lunar Lake) | 35–60 tok/s | 12–20 tok/s | 6–10 tok/s |
| AMD Radeon iGPU (780M, 890M) | 40–70 tok/s | 15–25 tok/s | 7–12 tok/s |
| Snapdragon 8 Gen 3+ (Android WebGPU) | 30–50 tok/s | 8–15 tok/s | OOM |
| iPhone 15 Pro / 16 (iOS 26 WebGPU) | 40–70 tok/s | OOM | OOM |

**Time-to-first-token** (TTFT) separate from streaming tok/s:
- Cold load (first visit): 15–90 s for download depending on tier + connection,
  plus 1–8 s for WGSL kernel compilation.
- Warm load (cached): 1–5 s for shard read + 0.3–2 s for compile cache hit.
- Prompt prefill at 4 K context: 100–500 ms on M-series; 300 ms–1.5 s on RTX 4060.

**Honesty we should put in the UI:**
- Show "42 tok/s · Llama 3.2 3B · local" live during generation so users can
  see the real number on their hardware.
- When the user first loads a model, record a 50-token benchmark and store it
  in `localStorage`; use it to pre-populate the badge next session.
- If tok/s < 5 for 5 s straight, detect "this is unusably slow on this
  hardware" and surface a toast: "Your device is slow for this model. Try
  Tiny, or use the OpenRouter provider."

### Memory management (tab backgrounding)
- Chrome throttles background tabs' WebGPU scheduling; inference will stall
  when the tab is backgrounded. WebLLM survives this but won't make progress.
  Our UI should show "Paused — reactivate tab to continue" if we detect
  `document.visibilityState === 'hidden'` during generation.
- GPU memory leaks from WebGPU are real (see the Babylon.js forum thread about
  ~1 GB pinned after 5 route changes without proper teardown). Our `unloadModel()`
  must call `engine.unload()` AND release any intermediate buffers. Verify by
  watching `chrome://gpu-internals` during dev.
- `GPUDevice.lost` fires when the OS reclaims GPU memory (e.g. another tab
  opened a big WebGL canvas). Handle it: null out the engine, offer a one-click
  "Reload model" in the toast.
- SPA route changes that unmount the chat view MUST call `unloadModel()` in
  Svelte `onDestroy`. Otherwise the engine keeps its GPU buffers even after
  the component goes away.

---

## 10. Citations

- [WebGPU is now supported in major browsers — web.dev blog](https://web.dev/blog/webgpu-supported-major-browsers)
- [WebGPU — caniuse](https://caniuse.com/webgpu)
- [WebGPU Implementation Status — gpuweb wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- [WebGPU Hits Critical Mass: All Major Browsers Now Ship It — webgpu.com](https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers-now-ship-it/)
- [Overview of WebGPU — Chrome Developers](https://developer.chrome.com/docs/web-platform/webgpu/overview)
- [Browser AI and WebGPU 2026: Running AI Models Locally in Your Browser — Calmops](https://calmops.com/ai/browser-ai-webgpu-2026-complete-guide/)
- [WebGPU 2026: 70% Browser Support, 15x Performance Gains — byteiota](https://byteiota.com/webgpu-2026-70-browser-support-15x-performance-gains/)
- [mlc-ai/web-llm — GitHub](https://github.com/mlc-ai/web-llm)
- [WebLLM basic usage docs](https://webllm.mlc.ai/docs/user/basic_usage.html)
- [WebLLM API Reference](https://webllm.mlc.ai/docs/user/api_reference.html)
- [Build a local and offline-capable chatbot with WebLLM — web.dev](https://web.dev/articles/ai-chatbot-webllm)
- [MLC LLM Configure Quantization docs](https://llm.mlc.ai/docs/compilation/configure_quantization.html)
- [WebLLM Structured Generation Playground — HF Spaces](https://huggingface.co/spaces/mlc-ai/WebLLM-Structured-Generation-Playground)
- [XGrammar JSON generation tutorial](https://xgrammar.mlc.ai/docs/tutorials/json_generation.html)
- [XGrammar Structural Tag usage (OpenAI tool-call compatibility)](https://xgrammar.mlc.ai/docs/tutorials/structural_tag.html)
- [WebLLM Add OPFS option for model storage — issue #660](https://github.com/mlc-ai/web-llm/issues/660)
- [WebLLM Guide: Run AI Models in Your Browser (2026) — Local AI Master](https://localaimaster.com/blog/webllm-browser-ai-guide)
- [Transformers.js v4 release blog — Hugging Face](https://huggingface.co/blog/transformersjs-v4)
- [Transformers.js docs (main)](https://huggingface.co/docs/transformers.js/en/index)
- [Transformers.js Running models on WebGPU](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
- [huggingface/transformers.js — GitHub](https://github.com/huggingface/transformers.js)
- [Transformers.js v4: WebGPU-Powered AI Now Runs Locally in Browsers and Node.js — roboaidigest](https://roboaidigest.com/posts/2026-02-11-transformers-js-v4-webgpu/)
- [Release 4.0.0 — transformers.js](https://github.com/huggingface/transformers.js/releases/tag/4.0.0)
- [ngxson/wllama — GitHub](https://github.com/ngxson/wllama)
- [@wllama/wllama — npm](https://www.npmjs.com/package/@wllama/wllama)
- [ONNX Runtime Web WebGPU docs](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [ONNX Runtime Web unleashes generative AI via WebGPU — Microsoft Open Source](https://opensource.microsoft.com/blog/2024/02/29/onnx-runtime-web-unleashes-generative-ai-in-the-browser-using-webgpu/)
- [WebAssembly for LLM Inference: Running Models in Browsers — dasroot.net](https://dasroot.net/posts/2026/01/webassembly-llm-inference-browsers-onnx-webgpu/)
- [Rust for ML: Burn vs Candle — dasroot.net](https://dasroot.net/posts/2026/04/rust-machine-learning-burn-vs-candle-framework-comparison/)
- [huggingface/candle — GitHub](https://github.com/huggingface/candle)
- [Burn docs](https://burn.dev/docs/burn/)
- [Best Small AI Models to Run with Ollama (2026) — Local AI Master](https://localaimaster.com/blog/small-language-models-guide-2026)
- [Small Language Models Enterprise Edge — Meta Intelligence](https://www.meta-intelligence.tech/en/insight-slm-enterprise)
- [WebGPU Browser AI Inference: Cut Client-Side LLM Costs in 2026 — buildmvpfast](https://www.buildmvpfast.com/blog/webgpu-browser-ai-inference-cost-savings-2026)
- [Gemma 3 270M introduction — Google Developers Blog](https://developers.googleblog.com/en/introducing-gemma-3-270m/)
- [Gemma 4 model overview — Google AI for Developers](https://ai.google.dev/gemma/docs/core)
- [Cache models in the browser — Chrome AI docs](https://developer.chrome.com/docs/ai/cache-models)
- [The Definitive Guide to Local-First AI — SitePoint](https://www.sitepoint.com/definitive-guide-local-first-ai-2026/)
- [Profiling WebGPU Memory Usage — SitePoint](https://www.sitepoint.com/profiling-webgpu-memory-local-ai/)
- [WebGPU Explainer — W3C gpuweb](https://gpuweb.github.io/gpuweb/explainer/)
- [WebGPU W3C spec](https://www.w3.org/TR/webgpu/)
- [WebGPU-SPY: Finding Fingerprints in the Sandbox — arXiv 2401.04349](https://arxiv.org/abs/2401.04349)
- [GPUBreach side-channel attack — webpronews](https://www.webpronews.com/gpubreach-the-side-channel-attack-that-turns-your-graphics-card-against-your-cpu/)
- [CVE-2026-5281: Chrome WebGPU Zero-Day — SOCRadar](https://socradar.io/blog/cve-2026-5281-chrome-webgpu-zero-day/)
- [Chrome Security Update CVE-2025-12725/12726/12727 — SOCRadar](https://socradar.io/blog/chrome-security-update-fixes-webgpu-v8-flaws/)
- [3W for In-Browser AI: WebLLM + WASM + WebWorkers — Mozilla AI](https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/)
- [I Ran Three LLMs Entirely in the Browser — Refactory (DEV)](https://dev.to/refactory/i-ran-three-llms-entirely-in-the-browser-to-power-an-ai-coaching-feature-heres-what-i-measured-9jm)
- [Building a local LLM-driven chat for my web page — arj.no](https://www.arj.no/2026/04/02/building-a-local-llm-driven-chat-for-my-web-page/)
- [Copilot CLI BYOK and Local Models — GitHub Changelog (Apr 7, 2026)](https://github.blog/changelog/2026-04-07-copilot-cli-now-supports-byok-and-local-models/)
- [BYOK — OpenRouter docs](https://openrouter.ai/docs/guides/overview/auth/byok)
- [On-device models with WebAssembly and WebGPU — dev.to](https://dev.to/aileenvl/on-device-models-and-how-they-work-in-the-browser-thanks-to-web-assembly-and-webgpu-5bo6)
- [Running SmolVLM Locally with Transformers.js — PyImageSearch](https://pyimagesearch.com/2025/10/20/running-smolvlm-locally-in-your-browser-with-transformers-js/)
- [Running AI models in the browser with Transformers.js — Worldline tech](https://blog.worldline.tech/2026/01/13/transformersjs-intro.html)
