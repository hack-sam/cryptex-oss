<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import Wordmark from '$lib/components/brand/Wordmark.svelte';
  import Logo from '$lib/components/brand/Logo.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import ActiveRunsBadge from './ActiveRunsBadge.svelte';
  import MobileNavDrawer from './MobileNavDrawer.svelte';
  import Settings from 'lucide-svelte/icons/settings';
  import History from 'lucide-svelte/icons/history';
  import HelpCircle from 'lucide-svelte/icons/circle-help';
  import Menu from 'lucide-svelte/icons/menu';
  import { sessionLog } from '$lib/stores/sessionLog.svelte';

  interface Props {
    onopenHistory: () => void;
  }
  let { onopenHistory }: Props = $props();

  // Mobile drawer toggle. Hamburger button visible only `<sm`. Returns
  // focus to the trigger button on close (handled inline below).
  let drawerOpen = $state(false);
  let hamburgerBtn: HTMLButtonElement | undefined = $state();
  function closeDrawer(): void {
    drawerOpen = false;
    // Restore focus to the trigger so keyboard nav doesn't get lost.
    hamburgerBtn?.focus();
  }

  // Guide icon is context-aware: on a specific tool route it opens that
  // tool's guide page; otherwise it opens the top-level /guide index.
  const guideHref = $derived.by(() => {
    const path = $page.url.pathname;
    const toolMap: Record<string, string> = {
      transforms: 'transform',
      promptcraft: 'promptcraft',
      anticlassifier: 'anticlassifier',
      decode: 'decode',
      emoji: 'emoji'
    };
    for (const [route, slug] of Object.entries(toolMap)) {
      if (path.startsWith(base + '/' + route)) return `${base}/guide/${slug}/`;
    }
    return `${base}/guide/`;
  });
</script>

<header class="sticky top-0 z-30 border-b border-border/60 glass pt-safe backdrop-saturate-150">
  <div class="container flex h-14 items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <a href={base + '/'} class="flex items-center gap-2.5 transition-opacity hover:opacity-85">
        <Logo size={26} />
        <Wordmark size="md" />
      </a>
    </div>

    <div class="flex items-center gap-2">
      <ActiveRunsBadge />
      <button
        type="button"
        onclick={onopenHistory}
        class="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-9 sm:w-9"
        aria-label="Open session history"
        title="Session history (favorites, recent, activity)"
      >
        <History size={16} />
        {#if sessionLog.size > 0}
          <span
            class="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground"
            aria-label={`${sessionLog.size} session entries`}
          >
            {sessionLog.size > 99 ? '99+' : sessionLog.size}
          </span>
        {/if}
      </button>
      <a
        href={guideHref}
        class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-9 sm:w-9"
        aria-label="Open guide"
        title="Guide"
      >
        <HelpCircle size={16} />
      </a>
      <a
        href={base + '/settings/'}
        class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-9 sm:w-9"
        aria-label="Settings"
      >
        <Settings size={16} />
      </a>
      <ThemeToggle />
      <!-- Hamburger trigger: visible only below the `sm` breakpoint, where
           the desktop TabRail is hidden. Opens the MobileNavDrawer. -->
      <button
        bind:this={hamburgerBtn}
        type="button"
        onclick={() => (drawerOpen = true)}
        aria-label="Open tools menu"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        title="Tools"
        class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
      >
        <Menu size={18} />
      </button>
    </div>
  </div>
</header>

<MobileNavDrawer open={drawerOpen} onclose={closeDrawer} />
