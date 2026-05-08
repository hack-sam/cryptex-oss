<script lang="ts">
  import { allTechniques } from '$lib/chat/techniques/registry';
  import type { Technique } from '$lib/chat/techniques/types';
  import { techniqueRecents, pushRecent } from '$lib/stores/techniqueRecents.svelte';
  import { notify } from '$lib/stores/toast.svelte';
  import { onMount } from 'svelte';

  // Visibility + position state
  let visible = $state(false);
  let x = $state(0);
  let y = $state(0);

  // Captured selection state — `composerRange` points at TRIMMED bounds inside
  // the chat-composer textarea so leading/trailing whitespace is preserved on
  // replacement.
  let selectedText = $state('');
  let composerRange = $state<{ start: number; end: number; textarea: HTMLTextAreaElement } | null>(null);

  // Filter + keyboard nav
  let popoverQuery = $state('');
  let selectedIndex = $state(0);
  let popoverEl = $state<HTMLDivElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);

  // Race guard: when `mouseup` opens the popover, the same gesture's `click`
  // event would otherwise fall through to `onDocClick` and immediately close
  // it. We swallow one click after open.
  let justOpened = false;

  // Debounce token for mobile/keyboard-driven `selectionchange` events.
  let selChangeRaf: number | null = null;

  // Only local (deterministic) techniques — transformers + locally-templatable
  // mutators + modes. Classifiers / composites need an LLM round-trip and are
  // excluded.
  const localTechniques = allTechniques().filter((t) => t.local);

  /**
   * Score a technique against a normalized query. Higher is better; 0 means
   * "no match". Promotes exact id/name matches above substring matches; pure
   * description hits rank lowest.
   */
  function score(t: Technique, q: string): number {
    const id = t.id.toLowerCase();
    const name = t.name.toLowerCase();
    const desc = (t.description ?? '').toLowerCase();
    if (id === q || name === q) return 100;
    if (id.startsWith(q)) return 30;
    if (name.startsWith(q)) return 20;
    if (id.includes(q) || name.includes(q)) return 10;
    if (desc.includes(q)) return 1;
    return 0;
  }

  // Recently-applied techniques (top 5), filtered against the local catalog so
  // an orphaned id (technique removed in a refactor) doesn't surface as undef.
  const recentTechniques = $derived.by<Technique[]>(() => {
    const ids = techniqueRecents.value ?? [];
    const map = new Map(localTechniques.map((t) => [t.id, t]));
    return ids
      .map((id) => map.get(id))
      .filter((t): t is Technique => Boolean(t));
  });

  // Filtered list — when the query is empty, return everything; otherwise
  // rank by `score()` and drop zeros.
  const filtered = $derived.by<Technique[]>(() => {
    const q = popoverQuery.toLowerCase().trim();
    if (!q) return localTechniques;
    return localTechniques
      .map((t) => ({ t, s: score(t, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t);
  });

  // Flat keyboard-nav list: when query is empty, prepend the recent section
  // (deduped against the bulk catalog).
  const flatList = $derived.by<Technique[]>(() => {
    if (popoverQuery.trim()) return filtered;
    const recIds = new Set(recentTechniques.map((t) => t.id));
    const rest = filtered.filter((t) => !recIds.has(t.id));
    return [...recentTechniques, ...rest];
  });

  // Reset highlight when the filter changes.
  $effect(() => {
    void popoverQuery;
    selectedIndex = 0;
  });

  function clampToViewport(px: number, py: number, width = 288, height = 280): { x: number; y: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let cx = Math.min(px, vw - width - 8);
    cx = Math.max(cx, 8);
    let cy = py;
    // Prefer below selection; flip above if not enough room.
    if (cy + height > vh - 8) cy = py - height - 28;
    cy = Math.max(cy, 8);
    return { x: cx, y: cy };
  }

  /**
   * Trim leading/trailing whitespace from the textarea selection and return
   * the reduced range alongside the trimmed text. Returns `null` when the
   * selection is empty or all-whitespace.
   */
  function trimmedSelection(textarea: HTMLTextAreaElement): { start: number; end: number; text: string } | null {
    const rawStart = textarea.selectionStart;
    const rawEnd = textarea.selectionEnd;
    if (rawStart === rawEnd) return null;
    const raw = textarea.value.slice(rawStart, rawEnd);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const start = rawStart + leading;
    const end = rawEnd - trailing;
    if (end <= start) return null;
    return { start, end, text: textarea.value.slice(start, end) };
  }

  /**
   * Find the currently-focused composer textarea, if any. Mounted globally so
   * we must guard against any other focused field (chat workspace search,
   * dataset filters, etc.).
   */
  function getComposerTextarea(): HTMLTextAreaElement | null {
    const active = document.activeElement as HTMLElement | null;
    const composerEl = active?.closest?.('.composer-textarea');
    return composerEl?.querySelector('textarea') ?? null;
  }

  function tryOpenAt(px: number, py: number): void {
    const textarea = getComposerTextarea();
    if (!textarea) {
      // Selection moved outside the composer — close any open popover.
      visible = false;
      composerRange = null;
      return;
    }
    const trimmed = trimmedSelection(textarea);
    if (!trimmed || trimmed.text.length < 2) {
      visible = false;
      composerRange = null;
      return;
    }
    selectedText = trimmed.text;
    composerRange = { start: trimmed.start, end: trimmed.end, textarea };
    const pos = clampToViewport(px, py);
    x = pos.x;
    y = pos.y;
    popoverQuery = '';
    selectedIndex = 0;
    visible = true;
    justOpened = true;
    requestAnimationFrame(() => { justOpened = false; });
  }

  function onMouseUp(e: MouseEvent): void {
    // Don't react to clicks INSIDE the popover — those are the user picking a
    // technique. Without this guard, the first mouseup on a button would null
    // out `composerRange` before the click handler runs.
    if (popoverEl && popoverEl.contains(e.target as Node)) return;
    // Defer one frame so the browser has finalised the selection range.
    requestAnimationFrame(() => {
      tryOpenAt(e.clientX + window.scrollX, e.clientY + window.scrollY + 12);
    });
  }

  function onSelectionChange(): void {
    // Mouseup already covers the desktop case with precise cursor positioning;
    // selectionchange is the fallback for touch / keyboard / programmatic
    // selection (iPad drag, Shift+Arrow). Skip when popover is already open.
    if (visible) return;
    if (selChangeRaf !== null) cancelAnimationFrame(selChangeRaf);
    selChangeRaf = requestAnimationFrame(() => {
      selChangeRaf = null;
      const textarea = getComposerTextarea();
      if (!textarea) return;
      // Anchor the popover at the textarea's bottom-left — best we can do
      // without per-glyph position info on touch.
      const rect = textarea.getBoundingClientRect();
      tryOpenAt(rect.left + window.scrollX + 8, rect.bottom + window.scrollY + 4);
    });
  }

  function onDocClick(e: MouseEvent): void {
    if (!visible || justOpened) return;
    if (popoverEl && popoverEl.contains(e.target as Node)) return;
    visible = false;
    composerRange = null;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!visible) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      visible = false;
      composerRange = null;
      return;
    }
    const list = flatList;
    if (list.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % list.length;
      scrollSelectedIntoView();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + list.length) % list.length;
      scrollSelectedIntoView();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void applyTechnique(list[selectedIndex]);
      return;
    }
  }

  function scrollSelectedIntoView(): void {
    if (!listEl) return;
    requestAnimationFrame(() => {
      const el = listEl?.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  async function applyTechnique(t: Technique | undefined): Promise<void> {
    if (!t || !t.local) return;
    let result;
    try {
      // `signal` is optional on TechniqueContext; transformer-techniques ignore
      // ctx entirely. We pass a no-op `callLLM` for safety even though local
      // techniques shouldn't reach for it.
      result = await t.apply(selectedText, {
        originalInput: selectedText,
        callLLM: async () => ''
      });
    } catch (err) {
      notify.error(`Transform failed: ${(err as Error).message ?? 'unknown'}`);
      return;
    }
    if (result.metadata?.error) {
      notify.error(`Transform failed: ${result.metadata.error as string}`);
      return;
    }
    const output = result.output;

    if (composerRange) {
      const { start, end, textarea } = composerRange;
      textarea.setRangeText(output, start, end, 'end');
      // Bubble an `input` event so the composer's auto-resize runs.
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Fallback path — kept for future callers that mount the popover
      // outside the chat workspace.
      window.dispatchEvent(
        new CustomEvent('technique:apply-selection', {
          detail: { techniqueId: t.id, selectedText, transformed: output }
        })
      );
    }
    pushRecent(t.id);
    visible = false;
    composerRange = null;
  }

  onMount(() => {
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKeydown);
      if (selChangeRaf !== null) cancelAnimationFrame(selChangeRaf);
    };
  });
</script>

{#if visible}
  <div
    bind:this={popoverEl}
    role="menu"
    class="fixed z-40 w-72 rounded-lg border border-border/60 bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
    style="left: {x}px; top: {y}px;"
  >
    <div class="px-2 pt-2">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        autofocus
        type="text"
        bind:value={popoverQuery}
        placeholder="Filter transforms…"
        class="w-full rounded border border-border/40 bg-background px-2 py-1 text-xs outline-none focus:border-primary/50"
      />
    </div>

    <div class="px-2 py-1 border-b border-border/40 text-[10px] text-muted-foreground">
      {#if popoverQuery.trim()}
        {flatList.length} match{flatList.length === 1 ? '' : 'es'} · {selectedText.length}-char selection
      {:else}
        {localTechniques.length} techniques · {selectedText.length}-char selection
      {/if}
    </div>

    <div bind:this={listEl} class="max-h-56 overflow-y-auto cryptex-scroll p-1">
      {#each flatList as t, i (t.id)}
        {#if !popoverQuery.trim() && recentTechniques.length > 0 && i === 0}
          <div class="px-2 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Recent</div>
        {/if}
        {#if !popoverQuery.trim() && recentTechniques.length > 0 && i === recentTechniques.length}
          <div class="mt-1 border-t border-border/40 px-2 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">All</div>
        {/if}
        <button
          type="button"
          role="menuitem"
          data-idx={i}
          onclick={() => applyTechnique(t)}
          class={'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ' +
            (i === selectedIndex ? 'bg-muted/60 text-foreground' : 'hover:bg-muted/40')}
        >
          <span class="mt-0.5 shrink-0 text-muted-foreground">{t.icon ?? '◈'}</span>
          <span class="flex flex-col min-w-0 flex-1">
            <span class="truncate font-medium text-foreground">{t.name}</span>
            <span class="truncate text-[10px] text-muted-foreground">
              <span class="mr-1 rounded bg-muted/40 px-1 py-0.5 font-mono text-[9px]">{t.category}</span>
              {t.description}
            </span>
          </span>
        </button>
      {/each}
      {#if flatList.length === 0}
        <p class="px-2 py-3 text-center text-[11px] text-muted-foreground">No techniques match "{popoverQuery}"</p>
      {/if}
    </div>
  </div>
{/if}
