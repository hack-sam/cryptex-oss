<script lang="ts">
  import type { ChatRow, MessageRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import ChatHeader from './ChatHeader.svelte';
  import MessageList from './MessageList.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import Composer from '../composer/Composer.svelte';
  import AttackChainSidebar from '../attack-chain/AttackChainSidebar.svelte';
  import { onMount } from 'svelte';

  type Props = { chat: ChatRow };
  let { chat }: Props = $props();
  let messages = $state<MessageRow[]>([]);
  let streaming = $state(false);
  let messageListEl = $state<{ scrollToBottom: () => void; scrollToBottomIfPinned: () => void } | null>(null);

  let streamingContent = $state('');
  let streamingReasoning = $state('');
  let attackChainOpen = $state(false);

  // Local activeMode state for instant pill feedback; DB write happens in setActiveMode.
  let activeMode = $state<string | null>(chat.settings.activeMode ?? null);
  // Sync with incoming chat prop when chat changes (e.g. navigation to different chat)
  $effect(() => { activeMode = chat.settings.activeMode ?? null; });

  async function setActiveMode(id: string | null) {
    activeMode = id; // instant visual update
    try {
      await repo.updateChat(chat.id, { settings: { ...chat.settings, activeMode: id } });
    } catch (err) {
      console.error('[mode] failed:', err);
      alert('Mode update failed: ' + (err as Error).message);
      activeMode = chat.settings.activeMode ?? null; // revert on error
    }
  }

  async function refresh() { messages = await repo.listMessages(chat.id); }
  $effect(() => { refresh(); });

  // Unconditional scroll to bottom whenever the message list grows (user send or assistant finish).
  // During streaming deltas we use pin-aware scroll so the user can scroll up to read without fighting.
  $effect(() => {
    messages.length; // reactive dep — re-runs on every append
    messageListEl?.scrollToBottom();
  });

  function onMessageAppended(msg: MessageRow) {
    messages = [...messages, msg];
    refresh();
    streamingContent = '';
    streamingReasoning = '';
    // scrollToBottom is triggered by the $effect above reacting to messages.length
  }

  function onTextDelta(delta: string) {
    streamingContent += delta;
    messageListEl?.scrollToBottomIfPinned();
  }
  function onReasoningDelta(delta: string) { streamingReasoning += delta; }

  onMount(() => {
    const handler = () => { attackChainOpen = !attackChainOpen; };
    window.addEventListener('chat:open-attack-chain', handler);
    return () => window.removeEventListener('chat:open-attack-chain', handler);
  });
</script>

<div
  class="grid h-full"
  style:grid-template-columns={attackChainOpen ? 'minmax(0,1fr) 440px' : 'minmax(0,1fr)'}
>
  <div class="fade-in flex h-full min-w-0 flex-col gap-2">
    <ChatHeader {chat} />
    <MessageList bind:this={messageListEl} {chat} {messages} />

    {#if streaming}
      <MessageBubble
        {chat}
        message={{
          id: 'streaming',
          ownerId: 'local',
          chatId: chat.id,
          role: 'assistant',
          createdAt: Date.now(),
          content: streamingContent,
          reasoning: streamingReasoning || undefined,
          tags: []
        } as MessageRow}
        live={true}
      />
    {/if}

    <Composer
      {chat}
      {activeMode}
      onModeChange={setActiveMode}
      {onMessageAppended}
      {onTextDelta}
      {onReasoningDelta}
      onStreamingChanged={(v) => (streaming = v)}
    />
  </div>

  {#if attackChainOpen}
    <AttackChainSidebar
      open={attackChainOpen}
      {chat}
      onClose={() => (attackChainOpen = false)}
      onInsertToComposer={(text) =>
        window.dispatchEvent(new CustomEvent('composer:insert', { detail: { text } }))}
    />
  {/if}
</div>
