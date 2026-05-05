<script lang="ts">
  import type { ChatRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import ModelPickerV2 from '$lib/components/ai/ModelPickerV2.svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import EllipsisVertical from 'lucide-svelte/icons/ellipsis-vertical';
  import Zap from 'lucide-svelte/icons/zap';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import { lastChatModel } from '$lib/stores/lastChatModel.svelte';
  import { GODMODE_ENGINE_ENABLED } from '$lib/chat/techniques/godmode';
  import { session } from '$lib/auth/session.svelte';

  async function signOut() {
    await session.signOut();
    void goto(`${base}/login`);
  }

  type Props = { chat: ChatRow };
  let { chat }: Props = $props();

  let title = $state(chat.title);
  let titleInput = $state<HTMLInputElement | null>(null);

  $effect(() => { title = chat.title; });

  async function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === chat.title) return;
    await repo.updateChat(chat.id, { title: trimmed });
  }

  async function onModelChange(v: string) {
    await repo.updateChat(chat.id, { modelQualifiedId: v });
    lastChatModel.value = v;
  }

  async function setActiveTool(tool: 'chain' | 'godmode') {
    await repo.updateChat(chat.id, {
      settings: { ...(chat.settings ?? {}), workspaceTab: tool, workspaceOpen: true }
    });
  }

  async function setMode(mode: 'creative' | 'intelligent' | 'adaptive') {
    await repo.updateChat(chat.id, {
      settings: { ...(chat.settings ?? {}), activeMode: mode }
    });
  }

  function focusTitle() {
    titleInput?.focus();
    titleInput?.select();
  }

  async function duplicateChat() {
    const newChat = await repo.duplicateChat(chat.id);
    if (newChat) goto(`${base}/chat/${newChat.id}`);
  }

  async function deleteChat() {
    await repo.deleteChat(chat.id);
    goto(`${base}/chat`);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(chat, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${chat.title.replace(/\s+/g, '_')}.json`;
    a.click(); URL.revokeObjectURL(url);
  }
</script>

<div class="flex items-center gap-3 border-b border-border/30 px-3 py-2">
  <input
    bind:this={titleInput}
    type="text"
    bind:value={title}
    onblur={saveTitle}
    class="min-w-0 flex-1 bg-transparent font-serif text-base outline-none focus:outline-none placeholder:text-muted-foreground"
    aria-label="Chat title"
  />
  <ModelPickerV2 value={chat.modelQualifiedId} onChange={onModelChange} recentsKey="cryptex.chat.recentModels" triggerClass="text-xs text-muted-foreground border border-border/40 rounded-full px-3 py-1 hover:border-border/70 hover:text-foreground transition-colors" />
  <div class="inline-flex rounded-md border border-border/40 bg-background/30 p-0.5 text-[11px]">
    <button
      type="button"
      onclick={() => setActiveTool('chain')}
      aria-pressed={(chat.settings?.workspaceTab ?? 'chain') === 'chain'}
      class={'inline-flex items-center gap-1 rounded px-2 py-1 transition ' +
        ((chat.settings?.workspaceTab ?? 'chain') === 'chain'
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground')}
    >
      <Zap size={11} /> Chain
    </button>
    {#if GODMODE_ENGINE_ENABLED}
      <button
        type="button"
        onclick={() => setActiveTool('godmode')}
        aria-pressed={chat.settings?.workspaceTab === 'godmode'}
        class={'inline-flex items-center gap-1 rounded px-2 py-1 transition ' +
          (chat.settings?.workspaceTab === 'godmode'
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground')}
      >
        <Sparkles size={11} /> Godmode
      </button>
    {/if}
  </div>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <button
          type="button"
          {...props}
          class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          aria-label="Chat options"
        >
          <EllipsisVertical size={14} />
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-40">
      {@const currentMode = chat.settings?.activeMode ?? 'creative'}
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger>
          <span>Mode</span>
          <span class="ml-auto text-[10px] capitalize text-muted-foreground">{currentMode}</span>
        </DropdownMenu.SubTrigger>
        <DropdownMenu.SubContent>
          <DropdownMenu.Item onclick={() => setMode('creative')}>
            <span class="capitalize">Creative</span>
            {#if currentMode === 'creative'}<span class="ml-auto text-primary">✓</span>{/if}
          </DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => setMode('intelligent')}>
            <span class="capitalize">Intelligent</span>
            {#if currentMode === 'intelligent'}<span class="ml-auto text-primary">✓</span>{/if}
          </DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => setMode('adaptive')}>
            <span class="capitalize">Adaptive</span>
            {#if currentMode === 'adaptive'}<span class="ml-auto text-primary">✓</span>{/if}
          </DropdownMenu.Item>
        </DropdownMenu.SubContent>
      </DropdownMenu.Sub>
      <DropdownMenu.Separator />
      <DropdownMenu.Item onclick={focusTitle}>Rename</DropdownMenu.Item>
      <DropdownMenu.Item onclick={duplicateChat}>Duplicate</DropdownMenu.Item>
      <DropdownMenu.Item onclick={exportJson}>Export as JSON</DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item onclick={deleteChat} class="text-destructive focus:text-destructive">Delete</DropdownMenu.Item>
      {#if session.isSignedIn}
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={signOut}>
          Sign out{session.current?.email ? ` (${session.current.email})` : ''}
        </DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</div>
