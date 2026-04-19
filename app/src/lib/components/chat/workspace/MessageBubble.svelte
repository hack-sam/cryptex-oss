<script lang="ts">
  import type { MessageRow, ChatRow, AttachmentRow } from '$lib/chat/types';
  import ReasoningBlock from './ReasoningBlock.svelte';
  import ToolCallCard from './ToolCallCard.svelte';
  import CodeBlock from './CodeBlock.svelte';
  import SlashCommandBlock from './SlashCommandBlock.svelte';
  import { find as findTechnique } from '$lib/chat/techniques/registry';
  import { forkChat } from '$lib/chat/dispatch';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { Streamdown } from 'svelte-streamdown';
  import { cn } from '$lib/utils/cn';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Paperclip from 'lucide-svelte/icons/paperclip';
  import Logo from '$lib/components/brand/Logo.svelte';
  import UserIcon from 'lucide-svelte/icons/user';
  import Wrench from 'lucide-svelte/icons/wrench';
  import Info from 'lucide-svelte/icons/info';
  import { repo } from '$lib/chat/repo';

  type Props = { message: MessageRow; chat: ChatRow; live?: boolean };
  let { message, chat, live = false }: Props = $props();

  let copied = $state(false);
  let attachments = $state<AttachmentRow[]>([]);

  $effect(() => {
    if (message.attachmentIds && message.attachmentIds.length > 0) {
      repo.listAttachments(message.id).then((rows) => { attachments = rows; });
    } else {
      attachments = [];
    }
  });

  async function handleFork() {
    try {
      const newChat = await forkChat(chat, message.id);
      await goto(`${base}/chat/${newChat.id}`);
    } catch (err) {
      console.error('[fork] failed:', err);
      alert('Fork failed: ' + (err as Error).message);
    }
  }

  async function copyContent() {
    await navigator.clipboard.writeText(message.content);
    copied = true;
    setTimeout(() => { copied = false; }, 1800);
  }

  /** Strip UUID prefix from openai-compat qualified IDs, e.g.
   *  openai-compat:bb0c89de-3f43.../openai/gpt-oss-120b → openai/gpt-oss-120b */
  function prettyModel(qualifiedId: string | undefined): string {
    if (!qualifiedId) return '';
    const parts = qualifiedId.split(':');
    const suffix = parts[parts.length - 1] ?? qualifiedId;
    if (suffix.includes('/')) {
      const segments = suffix.split('/');
      // If first segment looks like a UUID (contains - and len~36), drop it
      if (segments[0].includes('-') && segments[0].length >= 32) segments.shift();
      return segments.join('/');
    }
    return suffix;
  }

  const modelLabel = $derived(prettyModel(message.modelRequested ?? message.modelReturned));

  const timestamp = $derived(
    new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const isUser      = $derived(message.role === 'user');
  const isAssistant = $derived(message.role === 'assistant');
  const isTool      = $derived(message.role === 'tool');
  const isSystem    = $derived(message.role === 'system');

  // Modes that wrap messages without producing a slash-style mutation preview.
  // Any other modeApplied value that is a registered technique OR 'btw' renders
  // via SlashCommandBlock below.
  const MODE_ONLY = new Set(['creative', 'intelligent', 'adaptive']);

  const slashTechnique = $derived(
    message.role === 'user' && message.modeApplied && !MODE_ONLY.has(message.modeApplied)
      ? findTechnique(message.modeApplied)
      : undefined
  );

  const slashTitle = $derived(
    slashTechnique?.name ?? (message.modeApplied === 'btw' ? 'Side question' : message.modeApplied ?? '')
  );

  const showSlashBlock = $derived(
    message.role === 'user' &&
    !!message.modeApplied &&
    !MODE_ONLY.has(message.modeApplied) &&
    !!message.contentRaw &&
    message.contentRaw !== message.content
  );
</script>

<div class="chat-bubble-enter mb-2.5 flex items-start gap-2.5 {isUser ? 'flex-row-reverse' : 'flex-row'}">
  <!-- Avatar -->
  <div class="flex-none mt-0.5">
    {#if isUser}
      <div class="grid h-7 w-7 place-items-center rounded-full bg-primary/20 text-primary">
        <UserIcon size={14} />
      </div>
    {:else if isAssistant}
      <div class={cn(
        'grid h-7 w-7 place-items-center rounded-full bg-accent/15 border border-accent/30',
        live && 'animate-pulse'
      )}>
        <Logo size={16} />
      </div>
    {:else if isTool}
      <div class="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">
        <Wrench size={13} />
      </div>
    {:else}
      <div class="grid h-7 w-7 place-items-center rounded-full bg-muted/40 text-muted-foreground">
        <Info size={13} />
      </div>
    {/if}
  </div>

  <article
    class={cn(
      'chat-bubble group min-w-[80px] max-w-[85%] rounded-xl border px-3.5 py-2.5 text-sm transition-colors',
      isUser      && 'border-primary/15 bg-primary/5',
      isAssistant && 'border-border/50 bg-card/40',
      isTool      && 'border-primary/20 bg-primary/5',
      isSystem    && 'border-border/30 bg-card/20 opacity-60'
    )}
  >
  <header class="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
    <span class="flex items-center gap-1.5">
      {modelLabel ? modelLabel : message.role}{live ? ' · streaming…' : ''}
    </span>
    <div class="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
      <button
        type="button"
        onclick={copyContent}
        aria-label="Copy message"
        class="rounded p-0.5 hover:bg-muted/40 hover:text-foreground transition-colors"
      >
        {#if copied}
          <Check size={11} />
        {:else}
          <Copy size={11} />
        {/if}
      </button>
      {#if isAssistant && !live && message.id !== 'streaming'}
        <button
          type="button"
          onclick={handleFork}
          class="inline-flex items-center gap-1 rounded p-0.5 hover:bg-muted/40 hover:text-foreground transition-colors"
          aria-label="Fork from this message"
        >
          <GitBranch size={11} /> Fork
        </button>
      {/if}
    </div>
  </header>

  {#if live}
    <div class="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
      <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"></span>
      <span class="animate-pulse">Thinking…</span>
    </div>
  {/if}

  {#if message.reasoning}
    <ReasoningBlock text={message.reasoning} {live} />
  {/if}

  {#if message.toolCalls}
    {#each message.toolCalls as call (call.toolCallId)}
      <ToolCallCard {call} />
    {/each}
  {/if}

  {#if isAssistant || isTool}
    <div class="prose prose-sm dark:prose-invert max-w-none min-w-0 leading-relaxed text-foreground">
      <Streamdown content={message.content} components={{ code: CodeBlock }} />
    </div>
  {:else if showSlashBlock}
    <!-- Slash mutator: unified collapsible preview for every slash technique -->
    {#if attachments.length > 0}
      <div class="mb-2 flex flex-wrap gap-1.5">
        {#each attachments as a (a.id)}
          <span class="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
            <Paperclip size={10} /> {a.name} <span class="opacity-60">· {Math.round(a.size / 1024)} KB</span>
          </span>
        {/each}
      </div>
    {/if}
    <SlashCommandBlock
      title={slashTitle}
      slashId={message.modeApplied!}
      rawInput={message.contentRaw!}
      rewrite={message.content}
    />
  {:else}
    <!-- Plain user message OR mode-applied (show contentRaw if present, else content) -->
    {#if attachments.length > 0}
      <div class="mb-2 flex flex-wrap gap-1.5">
        {#each attachments as a (a.id)}
          <span class="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
            <Paperclip size={10} /> {a.name} <span class="opacity-60">· {Math.round(a.size / 1024)} KB</span>
          </span>
        {/each}
      </div>
    {/if}
    {@const displayText = message.contentRaw ?? message.content}
    {#if displayText.trim()}
      <p class="whitespace-pre-wrap leading-relaxed">{displayText}</p>
    {:else if attachments.length === 0}
      <p class="whitespace-pre-wrap leading-relaxed">{displayText}</p>
    {/if}
  {/if}

  <!-- Timestamp footer -->
  <footer class="mt-1.5 flex justify-end">
    <time class="text-[10px] text-muted-foreground opacity-60">{timestamp}</time>
  </footer>
  </article>
</div>
