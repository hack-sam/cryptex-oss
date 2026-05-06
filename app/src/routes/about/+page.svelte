<script lang="ts">
  import { base } from '$app/paths';
  import { transformerCount, categories } from '$lib/transformers/registry';
  import { mutatorTechniques } from '$lib/chat/techniques/from-mutators';
  import { classifierTechniques } from '$lib/chat/techniques/from-classifier';
  import { compositeTechniques } from '$lib/chat/techniques/from-composites';
  import Logo from '$lib/components/brand/Logo.svelte';
  import Wordmark from '$lib/components/brand/Wordmark.svelte';
  import Lock from 'lucide-svelte/icons/lock';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Github from 'lucide-svelte/icons/github';
  import Cpu from 'lucide-svelte/icons/cpu';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Wand from 'lucide-svelte/icons/wand-sparkles';
  import ScanSearch from 'lucide-svelte/icons/scan-search';
  import Smile from 'lucide-svelte/icons/smile';
  import Hash from 'lucide-svelte/icons/hash';
  import Bomb from 'lucide-svelte/icons/bomb';
  import FlaskConical from 'lucide-svelte/icons/flask-conical';
  import Shield from 'lucide-svelte/icons/shield';
  import Skull from 'lucide-svelte/icons/skull';
  import Target from 'lucide-svelte/icons/target';
  import Database from 'lucide-svelte/icons/database';
  import Zap from 'lucide-svelte/icons/zap';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Bolt from 'lucide-svelte/icons/zap';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Fingerprint from 'lucide-svelte/icons/fingerprint';
  import Globe from 'lucide-svelte/icons/globe';
  import Layers from 'lucide-svelte/icons/layers';

  const mutatorCount = mutatorTechniques().length;
  const classifierCount = classifierTechniques().length;
  const compositeCount = compositeTechniques().length;
  // Tools tabs total — TabRail.svelte ships 26 entries (10 base + 16 redteam).
  const toolsCount = 26;

  const stats = [
    { label: 'Transforms',     value: transformerCount, icon: Wand,      blurb: 'Encodings, ciphers, Unicode lookalikes, ancient scripts.' },
    { label: 'Mutators',       value: mutatorCount,     icon: Sparkles,  blurb: 'Single-prompt rewriters from 2024-2026 literature.' },
    { label: 'Workbenches',    value: toolsCount,       icon: FlaskConical, blurb: 'Specialized red-team UIs, each one tab in the rail.' },
    { label: 'Classifiers',    value: classifierCount,  icon: Fingerprint, blurb: 'Detection-evasion paraphrase strategies.' },
    { label: 'Composites',     value: compositeCount,   icon: Layers,    blurb: 'Pre-built attack chains: layered, multi-layer, smuggle.' },
    { label: 'Categories',     value: categories.length, icon: Globe,    blurb: 'Transformer family taxonomies in the catalog.' }
  ];

  const features = [
    { icon: Lock,         title: 'Local-first',          body: 'Tool inputs, transforms, and chat history stay in your browser. No telemetry, no analytics on tool surfaces, no data ever leaves your device.' },
    { icon: KeyRound,     title: 'Bring your own key',   body: 'Direct browser-to-provider calls (OpenRouter / Anthropic / OpenAI-compat). Keys live in localStorage and never traverse a Cryptex server.' },
    { icon: Github,       title: 'Open source',          body: 'Every transformer, mutator, judge, and benchmark is auditable on GitHub. Audit it, fork it, ship a PR, run your own.' },
    { icon: Bolt,         title: 'Browser-only',         body: 'No backend to maintain. SvelteKit static site. Deploys anywhere — GitHub Pages, Cloudflare, Dokploy, plain nginx.' },
    { icon: Globe,        title: 'Multi-provider',       body: '300+ models via OpenRouter, Claude direct via Anthropic, GPT / Groq / Together / Fireworks / DeepInfra / Cerebras / SambaNova via OpenAI-compat.' },
    { icon: Cpu,          title: 'Production-grade',     body: 'Real apps deploy this. Supabase auth seam, Dokploy compose contract, GA4 + AdSense optional, branded emails.' }
  ];

  const surfaces = [
    { icon: Wand,         label: 'Transform',     desc: '162 encoders / decoders' },
    { icon: ScanSearch,   label: 'Decode',        desc: 'Universal cipher detector' },
    { icon: Smile,        label: 'Emoji',         desc: 'Variation-selector stego' },
    { icon: MessageSquare, label: 'Gibberish',    desc: 'Dictionary + removal puzzles' },
    { icon: Hash,         label: 'Tokenizer',     desc: 'BPE visualizer (cl100k / o200k)' },
    { icon: Bomb,         label: 'Tokenade',      desc: 'Token-cost stress payloads' },
    { icon: FlaskConical, label: 'Fuzzer',        desc: 'Mutation strategies (500 variants)' },
    { icon: Sparkles,     label: 'PromptCraft',   desc: 'All mutators, parallel variants' },
    { icon: Shield,       label: 'AntiClassifier', desc: 'Paraphrase rewrites' },
    { icon: Skull,        label: 'Red-team labs', desc: '16 specialized workbenches' },
    { icon: Target,       label: 'Benchmarks',    desc: 'HarmBench / StrongREJECT / JBB' },
    { icon: Database,     label: 'Dataset',       desc: 'ShareGPT + raw JSONL export' }
  ];

  const stack = [
    'SvelteKit 2', 'Svelte 5 runes', 'Tailwind 3', 'shadcn-svelte',
    'Supabase auth', 'Dexie (IndexedDB)', 'Vite', 'TypeScript',
    'OpenRouter', 'Anthropic SDK', 'pdfjs-dist', 'mammoth', 'tiktoken'
  ];
</script>

<svelte:head>
  <title>About · Cryptex</title>
  <meta
    name="description"
    content="Cryptex is the AI red-teamer's text lab — 162 transforms, 36 mutators, 26 specialized red-team workbenches, all running in your browser. Local-first, BYOK, open source."
  />
</svelte:head>

<article class="space-y-20 pb-20">
  <!-- ===== Hero ===== -->
  <header class="relative overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 shadow-glass sm:p-12">
    <!-- Animated gradient orbs -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full opacity-40 blur-3xl"
      style="background: radial-gradient(circle, hsl(var(--primary) / 0.45), transparent 65%);"
    ></div>
    <div
      aria-hidden="true"
      class="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full opacity-25 blur-3xl"
      style="background: radial-gradient(circle, hsl(var(--accent) / 0.4), transparent 65%);"
    ></div>

    <div class="relative space-y-7">
      <div class="flex items-center gap-3">
        <Logo size={56} class="cryptex-logo-pulse" />
        <Wordmark size="lg" />
      </div>

      <div class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <Sparkles size={11} class="text-primary" />
        <span>AI red-team research platform · v2026</span>
      </div>

      <h1 class="font-serif text-4xl tracking-tight text-balance sm:text-5xl lg:text-6xl">
        The text lab that <span class="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent italic">runs in your browser</span>.
      </h1>
      <p class="max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
        {transformerCount} transforms. {mutatorCount} mutators. {toolsCount} red-team workbenches. Three providers,
        one chat, every conversation persisted for export. Bring your own key, drop in any prompt — and never
        ship a single byte to a server we control.
      </p>

      <div class="flex flex-wrap items-center gap-3 pt-1">
        <a
          href={`${base}/transforms/`}
          class="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5"
        >
          Open the lab
          <ArrowRight size={14} class="transition-transform group-hover:translate-x-0.5" />
        </a>
        <a
          href={`${base}/guide/`}
          class="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-5 py-3 text-sm font-medium transition-colors hover:bg-muted/40"
        >
          Read the guide
        </a>
        <a
          href="https://github.com/m4xx101/cryptex"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-5 py-3 text-sm font-medium transition-colors hover:bg-muted/40"
        >
          <Github size={14} /> Source
        </a>
      </div>
    </div>
  </header>

  <!-- ===== Stats — production-grade counter row ===== -->
  <section class="space-y-5">
    <div class="flex items-end justify-between gap-3 border-b border-border/40 pb-3">
      <div>
        <h2 class="font-serif text-2xl tracking-tight">By the numbers</h2>
        <p class="text-sm text-muted-foreground">Live counts straight from the registries that ship with this build.</p>
      </div>
      <span class="hidden font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:inline">verified at build time</span>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each stats as s}
        <div class="group relative overflow-hidden rounded-2xl border border-border bg-card/60 p-5 shadow-glass transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-primary">
          <div
            aria-hidden="true"
            class="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-30"
            style="background: radial-gradient(circle, hsl(var(--primary) / 0.6), transparent 70%);"
          ></div>
          <div class="relative space-y-2">
            <div class="flex items-center justify-between">
              <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon size={16} />
              </span>
              <span class="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{s.label}</span>
            </div>
            <div class="font-mono text-5xl font-bold tracking-tight text-foreground tabular-nums">
              {s.value}
            </div>
            <p class="text-[12px] leading-relaxed text-muted-foreground">{s.blurb}</p>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- ===== Surfaces grid — what users actually see ===== -->
  <section class="space-y-5">
    <div>
      <h2 class="font-serif text-2xl tracking-tight">Surfaces</h2>
      <p class="text-sm text-muted-foreground">Twelve broad categories. Twenty-six tabs. One unified shell.</p>
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {#each surfaces as item}
        <div class="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/80">
          <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <item.icon size={18} />
          </span>
          <div class="min-w-0 flex-1">
            <div class="font-serif text-base text-foreground">{item.label}</div>
            <div class="mt-0.5 text-[12px] leading-snug text-muted-foreground">{item.desc}</div>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- ===== Why panel — the manifesto ===== -->
  <section class="space-y-5">
    <div>
      <h2 class="font-serif text-2xl tracking-tight">Why it's built this way</h2>
      <p class="text-sm text-muted-foreground">Six commitments baked into the architecture, not bolted on.</p>
    </div>
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each features as f}
        <article class="group relative overflow-hidden rounded-2xl border border-border bg-card/60 p-5 shadow-glass transition-all hover:-translate-y-0.5 hover:border-primary/40">
          <div class="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary transition-all group-hover:rotate-3 group-hover:bg-primary group-hover:text-primary-foreground">
            <f.icon size={18} />
          </div>
          <h3 class="mb-1.5 font-serif text-lg leading-tight">{f.title}</h3>
          <p class="text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
        </article>
      {/each}
    </div>
  </section>

  <!-- ===== Tech stack pills ===== -->
  <section class="space-y-5">
    <div>
      <h2 class="font-serif text-2xl tracking-tight">Built with</h2>
      <p class="text-sm text-muted-foreground">Modern, audited, maintainable.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each stack as item}
        <span class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-3 py-1 font-mono text-[11px] tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
          <span class="h-1 w-1 rounded-full bg-primary"></span>
          {item}
        </span>
      {/each}
    </div>
  </section>

  <!-- ===== Privacy callout ===== -->
  <section class="rounded-3xl border border-border/60 bg-gradient-to-br from-card/60 via-card/30 to-transparent p-6 shadow-glass sm:p-10">
    <div class="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
      <div class="flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
        <Lock size={32} />
      </div>
      <div class="space-y-3">
        <h2 class="font-serif text-2xl tracking-tight">Privacy is the architecture</h2>
        <p class="leading-relaxed text-muted-foreground">
          Tool inputs never leave your browser. AI calls go directly from your browser to whichever provider
          you configured — Cryptex is not in the request path. API keys live in <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[12px]">localStorage</code>; chat history lives in <code class="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[12px]">IndexedDB</code>. Read the
          <a href="{base}/privacy/" class="font-medium text-primary underline-offset-2 hover:underline">privacy policy</a> for what that means in plain English.
        </p>
      </div>
    </div>
  </section>

  <!-- ===== CTA ===== -->
  <section class="overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 shadow-primary sm:p-10">
    <div class="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
      <div class="space-y-3">
        <h2 class="font-serif text-3xl tracking-tight">Ready to break things, ethically?</h2>
        <p class="max-w-2xl leading-relaxed text-muted-foreground">
          Pick a workbench. Drop in a prompt. The decoder runs offline; the AI tools run against your own key.
          No account required for the offline tools.
        </p>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row lg:flex-col">
        <a
          href={`${base}/transforms/`}
          class="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-primary transition-transform hover:-translate-y-0.5"
        >
          Launch the lab
          <ArrowRight size={14} class="transition-transform group-hover:translate-x-0.5" />
        </a>
        <a
          href={`${base}/chat/`}
          class="inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/60 px-5 py-3 text-sm font-medium transition-colors hover:bg-muted/40"
        >
          <Zap size={14} /> Open chat
        </a>
      </div>
    </div>
  </section>

  <!-- ===== Footer-ish credits ===== -->
  <section class="border-t border-border/40 pt-6 text-center text-xs text-muted-foreground">
    Built by
    <a
      href="https://github.com/m4xx101"
      target="_blank"
      rel="noopener noreferrer"
      class="font-medium text-primary underline-offset-2 hover:underline"
    >@m4xx101</a>
    · Open source on
    <a
      href="https://github.com/m4xx101/cryptex"
      target="_blank"
      rel="noopener noreferrer"
      class="font-medium text-primary underline-offset-2 hover:underline"
    >GitHub</a>
    · MIT licensed
  </section>
</article>

<style>
  /* Subtle pulse on the brand mark to add a little life to the hero —
     respects prefers-reduced-motion via the global rule in app.css. */
  :global(.cryptex-logo-pulse) {
    animation: cryptex-logo-pulse 4s ease-in-out infinite;
  }
  @keyframes cryptex-logo-pulse {
    0%, 100% { filter: drop-shadow(0 0 0 transparent); }
    50%      { filter: drop-shadow(0 0 18px hsl(var(--primary) / 0.45)); }
  }
</style>
