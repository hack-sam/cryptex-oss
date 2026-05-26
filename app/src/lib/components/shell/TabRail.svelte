<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { cn } from '$lib/utils/cn';
  import { activeRuns } from '$lib/stores/activeRuns.svelte';
  import Wand from 'lucide-svelte/icons/wand-sparkles';
  import ScanSearch from 'lucide-svelte/icons/scan-search';
  import Smile from 'lucide-svelte/icons/smile';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Hash from 'lucide-svelte/icons/hash';
  import Bomb from 'lucide-svelte/icons/bomb';
  import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right';
  import FlaskConical from 'lucide-svelte/icons/flask-conical';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Shield from 'lucide-svelte/icons/shield';
  import Skull from 'lucide-svelte/icons/skull';
  import Zap from 'lucide-svelte/icons/zap';
  import ImageIcon from 'lucide-svelte/icons/image';
  import Link from 'lucide-svelte/icons/link';
  import Beaker from 'lucide-svelte/icons/flask-round';
  import GitCompare from 'lucide-svelte/icons/git-compare';
  import History from 'lucide-svelte/icons/history';
  import Wrench from 'lucide-svelte/icons/wrench';
  import FileText from 'lucide-svelte/icons/file-text';
  import Target from 'lucide-svelte/icons/target';
  import Gauge from 'lucide-svelte/icons/gauge';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Fingerprint from 'lucide-svelte/icons/fingerprint';
  import Droplet from 'lucide-svelte/icons/droplet';
  import FileScan from 'lucide-svelte/icons/file-scan';
  import Brain from 'lucide-svelte/icons/brain';
  import Layers from 'lucide-svelte/icons/layers';
  import MessageSquareText from 'lucide-svelte/icons/message-square-text';
  import Unplug from 'lucide-svelte/icons/unplug';
  import { onMount, tick } from 'svelte';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Tab = { href: string; label: string; icon: any; status?: 'live' | 'soon' };

  /**
   * Map a tab href to the activeRuns toolId for the tool it points to.
   * Tabs whose tools don't push run state into activeRuns return undefined
   * (so no indicator shows).
   */
  function hrefToToolId(href: string): string | undefined {
    switch (href) {
      case '/promptcraft':                return 'promptcraft';
      case '/anticlassifier':             return 'anticlassifier';
      case '/redteam/probe-lab':          return 'probe-lab';
      case '/redteam/cross-model-diff':   return 'cross-model-diff';
      case '/redteam/replayer':           return 'replayer';
      case '/redteam/harmbench':          return 'harmbench';
      case '/redteam/strongreject':       return 'strongreject';
      case '/redteam/jbb':                return 'jbb';
      case '/redteam/fingerprinter':      return 'fingerprinter';
      default:                            return undefined;
    }
  }

  const tabs: Tab[] = [
    // v2.2 (Wave 10.2): /gibberish, /tokenizer, /bijection deprecated and
    // hidden from the rail. Routes still resolve (deep-links still work)
    // and the pages render a deprecation banner pointing at the replacement.
    // Per the v2.2 audit: gibberish was pure novelty (no red-team value),
    // tokenizer overlapped with /fuzzer + standard LLM dev tools, bijection
    // was functionally subsumed by /transforms.
    { href: '/transforms',           label: 'Transform',    icon: Wand,           status: 'live' },
    { href: '/decode',               label: 'Decode',       icon: ScanSearch,     status: 'live' },
    { href: '/emoji',                label: 'Emoji',        icon: Smile,          status: 'live' },
    { href: '/tokenade',             label: 'Tokenade',     icon: Bomb,           status: 'live' },
    { href: '/fuzzer',               label: 'Fuzzer',       icon: FlaskConical,   status: 'live' },
    { href: '/promptcraft',          label: 'PromptCraft',  icon: Sparkles,       status: 'live' },
    { href: '/anticlassifier',       label: 'Anti-classifier', icon: Shield,      status: 'live' },
    { href: '/redteam/adv-suffix',       label: 'AdvSuffix',  icon: Skull,         status: 'live' },
    { href: '/redteam/glitch-tokens',    label: 'Glitch',     icon: Zap,           status: 'live' },
    { href: '/redteam/ocr-injection',    label: 'OCR Inject', icon: ImageIcon,     status: 'live' },
    { href: '/redteam/markdown-exfil',   label: 'MD Exfil',   icon: Link,          status: 'live' },
    { href: '/redteam/probe-lab',        label: 'Probe Lab',  icon: Beaker,        status: 'live' },
    { href: '/redteam/cross-model-diff', label: 'Cross-Diff', icon: GitCompare,    status: 'live' },
    { href: '/redteam/replayer',          label: 'Replayer',   icon: History,       status: 'live' },
    { href: '/redteam/tool-result-lab',   label: 'Tool Lab',    icon: Wrench,        status: 'live' },
    { href: '/redteam/indirect-injection', label: 'Indirect',   icon: FileText,      status: 'live' },
    { href: '/redteam/harmbench',          label: 'HarmBench',   icon: Target,        status: 'live' },
    { href: '/redteam/strongreject',       label: 'StrongREJECT', icon: Gauge,        status: 'live' },
    { href: '/redteam/jbb',                label: 'JBB',         icon: ShieldCheck,   status: 'live' },
    { href: '/redteam/fingerprinter',      label: 'Fingerprint', icon: Fingerprint,   status: 'live' },
    { href: '/redteam/watermark',          label: 'Watermark',   icon: Droplet,       status: 'live' },
    { href: '/redteam/pdf-injection',      label: 'PDF Inject',  icon: FileScan,      status: 'live' },
    // v2.2 (Wave 10.5): reasoning-model attack lab (H-CoT + Mousetrap)
    { href: '/redteam/reasoning-attack',   label: 'Reasoning',   icon: Brain,         status: 'live' },
    // v2.2 (Wave 10.6): SEAL stacked-cipher attack
    { href: '/redteam/stacked-cipher',     label: 'Stacked Cipher', icon: Layers,     status: 'live' },
    // v2.2 (Wave 10.7): Response Attack (AAAI 2026 context-priming)
    { href: '/redteam/response-attack',    label: 'Response',    icon: MessageSquareText, status: 'live' },
    // v2.2 (Wave 10.8): Abliteration probe + uncensored-model vault
    { href: '/redteam/abliteration',       label: 'Abliteration', icon: Unplug,        status: 'live' }
  ];

  let list: HTMLOListElement | undefined = $state();
  let indicator: HTMLSpanElement | undefined = $state();

  const pathname = $derived($page.url.pathname);
  function isActive(href: string) {
    const target = base + href;
    return pathname === target || pathname.startsWith(target + '/');
  }

  /**
   * Measure the active tab and position the sliding indicator underneath it.
   * Uses inline style rather than CSS classes so the transition is smooth
   * across tab changes AND survives viewport resizes.
   */
  async function positionIndicator() {
    if (!list || !indicator) return;
    await tick();
    const activeEl = list.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
    if (!activeEl) {
      indicator.style.opacity = '0';
      return;
    }
    // Measure full position so the indicator follows wrapped tabs to row 2+.
    const listRect = list.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();
    indicator.style.opacity = '1';
    indicator.style.width = `${tabRect.width}px`;
    indicator.style.height = `${tabRect.height}px`;
    indicator.style.transform = `translate(${tabRect.left - listRect.left}px, ${tabRect.top - listRect.top}px)`;
  }

  // Re-position when the route changes + on mount + on resize.
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    pathname;
    positionIndicator();
  });

  onMount(() => {
    positionIndicator();
    const ro = new ResizeObserver(() => positionIndicator());
    if (list) ro.observe(list);
    window.addEventListener('resize', positionIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', positionIndicator);
    };
  });
</script>

<nav aria-label="Tools" class="w-full">
  <ol
    bind:this={list}
    class="relative flex flex-wrap gap-1 p-1 rounded-xl glass shadow-glass"
  >
    <!-- Sliding primary indicator — full position (x, y, w, h) set imperatively so it
         follows the active tab even when flex-wrap pushes it onto row 2. -->
    <span
      bind:this={indicator}
      aria-hidden="true"
      class="pointer-events-none absolute top-0 left-0 rounded-lg bg-primary shadow-primary transition-all duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style="opacity: 0; width: 0; height: 0; transform: translate(0, 0);"
    ></span>

    {#each tabs as tab}
      {@const active = isActive(tab.href)}
      {@const toolId = hrefToToolId(tab.href)}
      {@const running = toolId ? activeRuns.isRunning(toolId) : false}
      <li class="relative flex-1 min-w-[130px]">
        <a
          href={base + tab.href}
          class={cn(
            'group relative z-10 flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-out',
            active
              ? 'text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground hover:scale-[1.02]'
          )}
          aria-current={active ? 'page' : undefined}
        >
          <tab.icon size={16} class={active ? '' : 'text-primary/80'} />
          <span>{tab.label}</span>
          {#if tab.status === 'soon'}
            <span class="rounded-full bg-muted px-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground group-hover:bg-card group-hover:text-foreground/70">
              soon
            </span>
          {/if}
          {#if running}
            <!-- Active-run indicator: small pulsing dot in the upper-right corner. -->
            <span
              aria-label="running"
              title="Running"
              class={cn(
                'absolute right-1.5 top-1.5 inline-block h-1.5 w-1.5 rounded-full animate-pulse',
                active ? 'bg-primary-foreground' : 'bg-primary'
              )}
            ></span>
          {/if}
        </a>
      </li>
    {/each}
  </ol>
</nav>
