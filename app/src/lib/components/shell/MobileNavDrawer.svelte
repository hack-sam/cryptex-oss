<script lang="ts">
  /**
   * Mobile-only navigation drawer.
   *
   * Below the `sm` breakpoint (< 640 px) the desktop TabRail wraps to
   * 3-5 rows and pushes the active-run indicator dots off-screen. The
   * drawer replaces it with a vertical full-screen list that uses the
   * same `tabs` array — single source of truth shared with TabRail.svelte.
   *
   * Accessibility:
   *   - role="dialog" + aria-modal="true"
   *   - focus trap inside the drawer while open
   *   - Escape key closes
   *   - clicking the backdrop closes
   *   - focus restores to the trigger button on close
   */
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { cn } from '$lib/utils/cn';
  import { tabs } from './TabRail.svelte';
  import { activeRuns } from '$lib/stores/activeRuns.svelte';
  import X from 'lucide-svelte/icons/x';
  import HelpCircle from 'lucide-svelte/icons/circle-help';
  import Info from 'lucide-svelte/icons/info';
  import Settings from 'lucide-svelte/icons/settings';

  interface Props {
    open: boolean;
    onclose: () => void;
  }
  let { open, onclose }: Props = $props();

  // Static "More" links — Guide / About / Settings. On mobile the header
  // hides the Guide button and About has no header entry, so without these
  // the only way to reach them on a phone is by typing the URL. (v2.5.0
  // shipped the drawer with tools only; this closes that gap.)
  const moreLinks = [
    { href: '/guide/', label: 'Guide', icon: HelpCircle },
    { href: '/about/', label: 'About', icon: Info },
    { href: '/settings/', label: 'Settings', icon: Settings }
  ];

  let dialog: HTMLDivElement | undefined = $state();
  let firstFocusable: HTMLAnchorElement | undefined = $state();

  const techniques = $derived(tabs.filter((t) => t.group === 'techniques'));
  const redteam = $derived(tabs.filter((t) => t.group === 'redteam'));
  const pathname = $derived($page.url.pathname);
  function isActive(href: string): boolean {
    const target = base + href;
    return pathname === target || pathname.startsWith(target + '/');
  }

  async function handleSelect(event: MouseEvent, href: string): Promise<void> {
    event.preventDefault();
    onclose();
    await goto(base + href);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onclose();
      return;
    }
    // Trap focus within the drawer.
    if (event.key === 'Tab' && dialog) {
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  $effect(() => {
    if (open) {
      // Pull focus into the drawer when it opens.
      void tick().then(() => firstFocusable?.focus());
      // Lock body scroll so the page underneath doesn't move while the
      // drawer scrolls internally.
      if (typeof document !== 'undefined') {
        document.body.style.overflow = 'hidden';
      }
    } else {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    bind:this={dialog}
    role="dialog"
    aria-modal="true"
    aria-label="Tools navigation"
    class="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm sm:hidden"
  >
    <!-- Backdrop click-to-close lives on the outer div; inner content stops propagation. -->
    <button
      type="button"
      aria-label="Close menu (backdrop)"
      onclick={onclose}
      class="absolute inset-0 -z-10 w-full cursor-default bg-transparent"
    ></button>

    <header class="flex items-center justify-between border-b border-border/60 px-4 py-3">
      <h2 class="font-serif text-lg">Tools</h2>
      <button
        type="button"
        onclick={onclose}
        aria-label="Close tools menu"
        class="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X size={18} />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-4 py-4">
      <section class="mb-6">
        <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Techniques</h3>
        <ul class="flex flex-col gap-1">
          {#each techniques as tab, i (tab.href)}
            {@const active = isActive(tab.href)}
            {@const running = activeRuns.isRunning(tab.toolId)}
            <li>
              <a
                bind:this={firstFocusable as HTMLAnchorElement}
                href={base + tab.href}
                onclick={(e) => handleSelect(e, tab.href)}
                aria-current={active ? 'page' : undefined}
                class={cn(
                  'group relative flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/60 bg-card/40 text-foreground hover:bg-muted'
                )}
              >
                <tab.icon size={18} class={active ? 'text-primary' : 'text-muted-foreground'} />
                <span class="flex-1">{tab.label}</span>
                {#if running}
                  <span
                    aria-label="running"
                    title="Running"
                    class="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"
                  ></span>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      </section>

      <section>
        <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Red-team labs</h3>
        <ul class="flex flex-col gap-1">
          {#each redteam as tab (tab.href)}
            {@const active = isActive(tab.href)}
            {@const running = activeRuns.isRunning(tab.toolId)}
            <li>
              <a
                href={base + tab.href}
                onclick={(e) => handleSelect(e, tab.href)}
                aria-current={active ? 'page' : undefined}
                class={cn(
                  'group relative flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/60 bg-card/40 text-foreground hover:bg-muted'
                )}
              >
                <tab.icon size={18} class={active ? 'text-primary' : 'text-muted-foreground'} />
                <span class="flex-1">{tab.label}</span>
                {#if running}
                  <span
                    aria-label="running"
                    title="Running"
                    class="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"
                  ></span>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      </section>

      <section class="mt-6">
        <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">More</h3>
        <ul class="flex flex-col gap-1">
          {#each moreLinks as link (link.href)}
            {@const active = isActive(link.href)}
            <li>
              <a
                href={base + link.href}
                onclick={(e) => handleSelect(e, link.href)}
                aria-current={active ? 'page' : undefined}
                class={cn(
                  'group relative flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/60 bg-card/40 text-foreground hover:bg-muted'
                )}
              >
                <link.icon size={18} class={active ? 'text-primary' : 'text-muted-foreground'} />
                <span class="flex-1">{link.label}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    </div>
  </div>
{/if}
