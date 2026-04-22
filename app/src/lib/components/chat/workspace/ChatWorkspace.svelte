<script lang="ts">
  import type { ChatRow, MessageRow } from '$lib/chat/types';
  import { repo } from '$lib/chat/repo';
  import { continueAssistantMessage } from '$lib/chat/dispatch';
  import ChatHeader from './ChatHeader.svelte';
  import MessageList from './MessageList.svelte';
  import Composer from '../composer/Composer.svelte';
  import AttackChainSidebar from '../attack-chain/AttackChainSidebar.svelte';
  import GodmodePanel from '$lib/chat/godmode/panel.svelte';
  import NoProviderBanner from '$lib/components/ai/NoProviderBanner.svelte';
  import { onMount } from 'svelte';

  type Props = { chat: ChatRow };
  let { chat }: Props = $props();
  let messages = $state<MessageRow[]>([]);
  let streaming = $state(false);
  let messageListEl = $state<{ scrollToBottom: () => void; scrollToBottomIfPinned: () => void } | null>(null);

  let streamingContent = $state('');
  let streamingReasoning = $state('');
  let attackChainOpen = $state(false);
  let godmodeOpen = $state(false);

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

  let continueCtrl = $state<AbortController | null>(null);

  async function handleContinueMessage(messageId: string) {
    if (streaming) return; // don't stack continuations over an in-flight stream
    streaming = true;
    continueCtrl = new AbortController();
    try {
      await continueAssistantMessage(chat, messageId, continueCtrl.signal, {
        onTextDelta,
        onReasoningDelta,
        onFinish: (msg) => onMessageAppended(msg),
        onError: (err) => { console.error('[continue]', err); }
      });
    } finally {
      streaming = false;
      continueCtrl = null;
    }
  }

  onMount(() => {
    const handler = () => { attackChainOpen = !attackChainOpen; };
    window.addEventListener('chat:open-attack-chain', handler);

    const godmodeHandler = () => { godmodeOpen = !godmodeOpen; };
    window.addEventListener('chat:open-godmode', godmodeHandler);

    const continueHandler = (e: Event) => {
      const id = (e as CustomEvent<{ messageId: string }>).detail?.messageId;
      if (typeof id === 'string') void handleContinueMessage(id);
    };
    window.addEventListener('chat:continue-message', continueHandler);

    return () => {
      window.removeEventListener('chat:open-attack-chain', handler);
      window.removeEventListener('chat:open-godmode', godmodeHandler);
      window.removeEventListener('chat:continue-message', continueHandler);
    };
  });
</script>

<div class="flex h-full w-full min-h-0 overflow-hidden">
  <div class="fade-in flex h-full min-w-0 min-h-0 flex-1 flex-col gap-2 overflow-hidden">
    <ChatHeader {chat} {attackChainOpen} {godmodeOpen} />
    <div class="px-3 pt-1"><NoProviderBanner context="chat" compact={true} /></div>
    <MessageList
      bind:this={messageListEl}
      {chat}
      {messages}
      {streaming}
      {streamingContent}
      {streamingReasoning}
    />

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

  {#if godmodeOpen}
    <GodmodePanel onClose={() => (godmodeOpen = false)} />
  {/if}
</div>
