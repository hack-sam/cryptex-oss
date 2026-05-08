<script lang="ts">
  import type { ChatRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import AttackChainTab from '$lib/components/chat/attack-chain/AttackChainTab.svelte';
  import GodmodeTab from '$lib/chat/godmode/GodmodeTab.svelte';
  import AttackHistoryDisclosure from './AttackHistoryDisclosure.svelte';
  import X from 'lucide-svelte/icons/x';
  import GripVertical from 'lucide-svelte/icons/grip-vertical';

  type Props = {
    chat: ChatRow;
    activeTab: 'chain' | 'godmode';
    onTabChange?: (t: 'chain' | 'godmode') => void;
    onClose: () => void;
    onResize?: (width: number) => void;
    onInsertToComposer: (text: string) => void;
  };
  let { chat, activeTab, onClose, onResize, onInsertToComposer }: Props = $props();

  // Title label for the hybrid header.
  const toolLabel = $derived(activeTab === 'chain' ? 'Chain' : 'Godmode');

  // Inline notify state — swapped for a toast library later if usage warrants.
  // Required to satisfy GodmodeTab's onNotify contract; surfaced as a tiny
  // bottom toast inside the tile.
  let notify = $state<{ kind: 'info' | 'error'; text: string } | null>(null);
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;
  function pushNotify(kind: 'info' | 'error', text: string) {
    notify = { kind, text };
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => (notify = null), 2500);
  }

  // ---- Resize handle (left edge of this tile) -------------------------
  const MIN_WIDTH = 320;
  const MAX_WIDTH = 800;
  const DEFAULT_WIDTH = 440;
  let width = $state<number>(
    chat.settings?.rightSidebarWidth ?? chat.settings?.workspaceWidth ?? DEFAULT_WIDTH
  );
  $effect(() => {
    width =
      chat.settings?.rightSidebarWidth ?? chat.settings?.workspaceWidth ?? DEFAULT_WIDTH;
  });

  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartWidth = 0;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  function onResizeStart(e: PointerEvent) {
    dragging = true;
    dragStartX = e.clientX;
    dragStartWidth = width;
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd, { once: true });
  }
  function onResizeMove(e: PointerEvent) {
    if (!dragging) return;
    // Tile is on the right; dragging left grows it.
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth + (dragStartX - e.clientX)));
    width = next;
    onResize?.(next);
  }
  function onResizeEnd() {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onResizeMove);
    if (persistTimer) clearTimeout(persistTimer);
    const id = chat.id;
    const w = width;
    persistTimer = setTimeout(() => {
      void repo.updateChat(id, {
        settings: { ...(chat.settings ?? {}), rightSidebarWidth: w }
      });
    }, 250);
  }
</script>

<aside
  class="relative glass rounded-lg border border-border/50 overflow-hidden flex flex-col"
  style:width="100%"
>
  <!-- Drag handle on left edge -->
  <button
    type="button"
    aria-label="Resize attack workspace"
    onpointerdown={onResizeStart}
    class="absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/30"
  ></button>

  <!-- Hybrid header -->
  <div class="flex items-center gap-2 border-b border-border/40 px-3 py-2 pl-4 text-xs">
    <GripVertical size={11} class="text-muted-foreground/60" />
    <span class="text-muted-foreground">Attack workspace</span>
    <span class="text-muted-foreground">·</span>
    <span class="font-medium text-foreground">{toolLabel}</span>
    <button
      type="button"
      aria-label="Close attack workspace"
      onclick={onClose}
      class="ml-auto rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    ><X size={11} /></button>
  </div>

  <!-- Per-chat session history — chain tab now renders the full
       AttackSessionHistory (with Promote / Pin / Delete actions) at the
       top of its own form, so the legacy header-disclosure is shown
       only on godmode where chain sessions aren't relevant. -->
  {#if activeTab === 'godmode'}
    <AttackHistoryDisclosure {chat} {activeTab} />
  {/if}

  <!-- Active form -->
  <div class="flex-1 min-h-0 overflow-hidden pl-1">
    {#if activeTab === 'chain'}
      <AttackChainTab {chat} {onInsertToComposer} />
    {:else}
      <GodmodeTab {chat} onNotify={pushNotify} />
    {/if}
  </div>

  <!-- Inline notify toast -->
  {#if notify}
    <div
      role="status"
      class={notify.kind === 'error'
        ? 'absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-orange-500/40 bg-orange-500/20 px-3 py-1.5 text-xs text-orange-400'
        : 'absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-primary/40 bg-primary/20 px-3 py-1.5 text-xs text-primary'}
    >{notify.text}</div>
  {/if}
</aside>
