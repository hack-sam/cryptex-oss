<script lang="ts">
  import ChevronRight from 'lucide-svelte/icons/chevron-right';

  type Props = {
    /** Display name of the technique, e.g. "Rephrase" or "CVE reproduction" */
    title: string;
    /** Slash id without the leading slash, e.g. "rephrase" */
    slashId: string;
    /** What the user typed verbatim (shown as the primary line) */
    rawInput: string;
    /** What was actually sent to the LLM after mutation */
    rewrite: string;
  };
  let { title, slashId, rawInput, rewrite }: Props = $props();
</script>

<p class="whitespace-pre-wrap leading-relaxed">{rawInput}</p>

<details class="slash-block group mt-2 rounded-md border border-border/40 bg-muted/20 text-xs">
  <summary
    class="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground"
  >
    <ChevronRight size={11} class="transition-transform group-open:rotate-90" />
    <span>Mutated via <code class="font-mono text-[10px] text-primary">/{slashId}</code> · {title}</span>
  </summary>
  <div class="slash-block-content max-h-60 overflow-y-auto cryptex-scroll border-t border-border/40 px-3 py-2">
    <pre class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{rewrite}</pre>
  </div>
</details>

<style>
  .slash-block-content {
    animation: slash-expand 160ms ease-out;
  }
  @keyframes slash-expand {
    from { opacity: 0; transform: translateY(-2px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
