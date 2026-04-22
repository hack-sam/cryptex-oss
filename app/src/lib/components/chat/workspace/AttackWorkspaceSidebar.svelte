<script lang="ts">
  import type { ChatRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import AttackChainTab from '$lib/components/chat/attack-chain/AttackChainTab.svelte';
  import GodmodeTab from '$lib/chat/godmode/GodmodeTab.svelte';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import { GODMODE_ENGINE_ENABLED } from '$lib/chat/techniques/godmode';
  import Zap from 'lucide-svelte/icons/zap';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import X from 'lucide-svelte/icons/x';

  type Props = {
    chat: ChatRow;
    activeTab: 'chain' | 'godmode';
    onTabChange: (t: 'chain' | 'godmode') => void;
    onClose: () => void;
    onInsertToComposer: (text: string) => void;
  };
  let { chat, activeTab, onTabChange, onClose, onInsertToComposer }: Props = $props();

  // Inline notify state — swapped for a toast library later if usage warrants.
  let notify = $state<{ kind: 'info' | 'error'; text: string } | null>(null);
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;
  function pushNotify(kind: 'info' | 'error', text: string) {
    notify = { kind, text };
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => (notify = null), 2500);
  }

  // Per-tab unread dot — flips to true when a run completes on the inactive tab.
  // Resets when the user switches to that tab. In MVP we wire only the Godmode
  // signal (a 'winner' event arriving while chain is active); Chain emits no
  // such signal today and the dot stays off for Chain.
  let chainUnread = $state(false);
  let godmodeUnread = $state(false);

  function selectTab(t: 'chain' | 'godmode') {
    if (t === 'chain') chainUnread = false;
    else godmodeUnread = false;
    onTabChange(t);
  }

  // Per-tab model picker state — reads from tab config, persists on change.
  const chainModel = $derived(chat.settings.attackChainConfig?.modelQualifiedId ?? chat.modelQualifiedId);
  const godmodeModel = $derived(chat.settings.godmodeConfig?.modelQualifiedId ?? chat.modelQualifiedId);

  async function onChainModelChange(v: string) {
    try {
      const fresh = await repo.getChat(chat.id);
      const base = fresh?.settings ?? chat.settings;
      await repo.updateChat(chat.id, {
        settings: {
          ...base,
          attackChainConfig: {
            input: base.attackChainConfig?.input ?? '',
            layers: base.attackChainConfig?.layers ?? ['', ''],
            layerParams: base.attackChainConfig?.layerParams ?? [{}, {}],
            layerOutputEdits: base.attackChainConfig?.layerOutputEdits ?? [null, null],
            executeEnabled: base.attackChainConfig?.executeEnabled ?? true,
            finalSystemPrompt: base.attackChainConfig?.finalSystemPrompt ?? '',
            autoRetryEnabled: base.attackChainConfig?.autoRetryEnabled ?? true,
            modelQualifiedId: v
          }
        }
      });
    } catch (err) {
      console.error('[workspace] chain model persist failed:', err);
    }
  }

  async function onGodmodeModelChange(v: string) {
    try {
      const fresh = await repo.getChat(chat.id);
      const base = fresh?.settings ?? chat.settings;
      await repo.updateChat(chat.id, {
        settings: {
          ...base,
          godmodeConfig: {
            task: base.godmodeConfig?.task ?? '',
            K: base.godmodeConfig?.K ?? 6,
            saveForm: base.godmodeConfig?.saveForm ?? { expanded: false, name: '', decompose: false },
            modelQualifiedId: v
          }
        }
      });
    } catch (err) {
      console.error('[workspace] godmode model persist failed:', err);
    }
  }
</script>

<aside
  class="flex h-full w-[440px] shrink-0 flex-col border-l border-border/50 bg-card/30 backdrop-blur-sm"
  aria-label="Attack workspace"
>
  <!-- Sticky header — tab strip + close -->
  <div class="sticky top-0 z-10 flex shrink-0 flex-col gap-2 border-b border-border/50 bg-card/80 px-3 py-2">
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => selectTab('chain')}
        aria-pressed={activeTab === 'chain'}
        class={activeTab === 'chain'
          ? 'inline-flex items-center gap-1 rounded-md border border-primary/60 bg-primary/20 px-2 py-1 text-xs text-primary'
          : 'inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground'}
      >
        <Zap size={11} />
        Chain
        {#if chainUnread}<span class="ml-1 h-1.5 w-1.5 rounded-full bg-primary"></span>{/if}
      </button>
      {#if GODMODE_ENGINE_ENABLED}
        <button
          type="button"
          onclick={() => selectTab('godmode')}
          aria-pressed={activeTab === 'godmode'}
          class={activeTab === 'godmode'
            ? 'inline-flex items-center gap-1 rounded-md border border-primary/60 bg-primary/20 px-2 py-1 text-xs text-primary'
            : 'inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground'}
        >
          <Sparkles size={11} />
          Godmode
          {#if godmodeUnread}<span class="ml-1 h-1.5 w-1.5 rounded-full bg-primary"></span>{/if}
        </button>
      {/if}
      <button
        type="button"
        onclick={onClose}
        aria-label="Close workspace"
        class="ml-auto inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
    <!-- Per-tab model picker -->
    {#if activeTab === 'chain'}
      <ModelPickerV2
        value={chainModel}
        onChange={onChainModelChange}
        recentsKey="cryptex.workspace.chain.recentModels"
        triggerClass="text-xs text-muted-foreground border border-border/40 rounded-md px-2 py-1 hover:border-border/70 hover:text-foreground transition-colors"
      />
    {:else}
      <ModelPickerV2
        value={godmodeModel}
        onChange={onGodmodeModelChange}
        recentsKey="cryptex.workspace.godmode.recentModels"
        triggerClass="text-xs text-muted-foreground border border-border/40 rounded-md px-2 py-1 hover:border-border/70 hover:text-foreground transition-colors"
      />
    {/if}
  </div>

  <!-- Tab bodies — both mounted, inactive is hidden (survives tab switches) -->
  <div class="flex min-h-0 flex-1 flex-col" hidden={activeTab !== 'chain'}>
    <AttackChainTab {chat} {onInsertToComposer} />
  </div>
  {#if GODMODE_ENGINE_ENABLED}
    <div class="flex min-h-0 flex-1 flex-col" hidden={activeTab !== 'godmode'}>
      <GodmodeTab {chat} onNotify={pushNotify} />
    </div>
  {/if}

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
