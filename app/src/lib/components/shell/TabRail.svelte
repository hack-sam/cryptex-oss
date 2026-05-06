<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { cn } from '$lib/utils/cn';
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
  import { onMount, tick } from 'svelte';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Tab = { href: string; label: string; icon: any; status?: 'live' | 'soon' };

  const tabs: Tab[] = [
    { href: '/transforms',           label: 'Transform',    icon: Wand,           status: 'live' },
    { href: '/decode',               label: 'Decode',       icon: ScanSearch,     status: 'live' },
    { href: '/emoji',                label: 'Emoji',        icon: Smile,          status: 'live' },
    { href: '/gibberish',            label: 'Gibberish',    icon: MessageSquare,  status: 'live' },
    { href: '/tokenizer',            label: 'Tokenizer',    icon: Hash,           status: 'live' },
    { href: '/tokenade',             label: 'Tokenade',     icon: Bomb,           status: 'live' },
    { href: '/bijection',            label: 'Bijection',    icon: ArrowLeftRight, status: 'live' },
    { href: '/fuzzer',               label: 'Fuzzer',       icon: FlaskConical,   status: 'live' },
    { href: '/promptcraft',          label: 'PromptCraft',  icon: Sparkles,       status: 'live' },
    { href: '/anticlassifier',       label: 'Anti-classifier', icon: Shield,      status: 'live' },
    { href: '/redteam/adv-suffix',    label: 'AdvSuffix',    icon: Skull,          status: 'live' },
    { href: '/redteam/glitch-tokens', label: 'Glitch',       icon: Zap,            status: 'live' }
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
        </a>
      </li>
    {/each}
  </ol>
</nav>
