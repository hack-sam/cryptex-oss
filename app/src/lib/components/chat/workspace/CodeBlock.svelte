<script lang="ts">
  import type { Tokens } from 'marked';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';

  type Props = { token: Tokens.Code; id?: string };
  let { token }: Props = $props();

  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token.text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (err) {
      console.error('[CodeBlock] clipboard write failed:', err);
    }
  }

  const lang = $derived((token.lang ?? '').toLowerCase().trim());
</script>

<div class="not-prose group relative my-3 overflow-hidden rounded-md border border-border/60 bg-muted/40 dark:bg-muted/20">
  <div class="flex items-center justify-between border-b border-border/50 bg-muted/60 px-3 py-1.5 dark:bg-muted/30">
    <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {lang || 'text'}
    </span>
    <button
      type="button"
      onclick={copy}
      aria-label="Copy code"
      class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {#if copied}
        <Check size={11} class="text-green-500" /> Copied
      {:else}
        <Copy size={11} /> Copy
      {/if}
    </button>
  </div>
  <pre class="cryptex-scroll max-h-[600px] overflow-x-auto overflow-y-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground"><code>{token.text}</code></pre>
</div>
