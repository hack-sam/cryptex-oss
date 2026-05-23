<script lang="ts">
  /**
   * Collapsible "About this technique" panel. Shows type, success heuristic
   * table, paper refs (as links for arXiv IDs), and last validated date.
   */
  import { getMetadata, type TechniqueMetadata } from '$lib/techniques/multi-step-metadata';
  import Info from 'lucide-svelte/icons/info';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ExternalLink from 'lucide-svelte/icons/external-link';

  type Props = {
    techniqueId: string;
    techniqueName?: string;
    /** Defaults to true; pass false to keep panel closed until clicked. */
    defaultOpen?: boolean;
  };
  let { techniqueId, techniqueName, defaultOpen = false }: Props = $props();

  // Snap the initial value into a local at construction; the user's open/close
  // clicks become the source of truth from that point on.
  let open = $state(false);
  $effect(() => {
    if (defaultOpen) open = true;
  });
  const meta = $derived<TechniqueMetadata>(getMetadata(techniqueId));

  // Convert an arXiv reference (e.g. "arXiv:2312.02119" or a string containing it)
  // into a clickable URL. Returns undefined if no arXiv id found.
  function arxivUrl(ref: string): string | undefined {
    const m = /arXiv:?(\d{4}\.\d{4,5})/i.exec(ref);
    return m ? `https://arxiv.org/abs/${m[1]}` : undefined;
  }
</script>

<section class="rounded-lg border border-border/40 bg-card/40">
  <button
    type="button"
    onclick={() => (open = !open)}
    class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/20"
    aria-expanded={open}
  >
    <div class="flex items-center gap-2">
      {#if open}
        <ChevronDown size={14} class="text-muted-foreground" />
      {:else}
        <ChevronRight size={14} class="text-muted-foreground" />
      {/if}
      <Info size={12} class="text-primary" />
      <span class="text-xs font-medium">About {techniqueName ?? techniqueId}</span>
      <span
        class={'inline-flex items-center rounded-full border px-2 py-0 text-[9px] uppercase tracking-wider ' +
          (meta.type === 'multi-turn'
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-muted text-muted-foreground')}
      >
        {meta.type}
      </span>
    </div>
    {#if meta.lastValidated}
      <span class="text-[10px] text-muted-foreground">last validated {meta.lastValidated}</span>
    {/if}
  </button>

  {#if open}
    <div class="border-t border-border/40 px-3 py-3 space-y-3">
      {#if meta.successHeuristic}
        <div>
          <h4 class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Success-rate heuristic (UI label only)
          </h4>
          <table class="w-full text-[11px] font-mono">
            <thead>
              <tr class="text-muted-foreground">
                <th class="text-left font-normal py-0.5">Model family</th>
                <th class="text-right font-normal py-0.5">Success rate</th>
              </tr>
            </thead>
            <tbody>
              {#if meta.successHeuristic.gpt4}
                <tr><td class="py-0.5">GPT-4 class</td><td class="text-right py-0.5">{meta.successHeuristic.gpt4}</td></tr>
              {/if}
              {#if meta.successHeuristic.claude35}
                <tr><td class="py-0.5">Claude 3.5 class</td><td class="text-right py-0.5">{meta.successHeuristic.claude35}</td></tr>
              {/if}
              {#if meta.successHeuristic.llama3}
                <tr><td class="py-0.5">Llama 3 class</td><td class="text-right py-0.5">{meta.successHeuristic.llama3}</td></tr>
              {/if}
            </tbody>
          </table>
          <p class="text-[10px] text-muted-foreground mt-1.5 italic">
            Coarse hand-curated ranges from published results; actual rates depend on the target
            snapshot, defense stack, and goal severity. Not a benchmark.
          </p>
        </div>
      {/if}

      {#if meta.paperRefs && meta.paperRefs.length > 0}
        <div>
          <h4 class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            References
          </h4>
          <ul class="space-y-1">
            {#each meta.paperRefs as ref (ref)}
              {@const url = arxivUrl(ref)}
              <li class="text-[11px]">
                {#if url}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 underline decoration-dotted hover:text-primary"
                  >
                    {ref}
                    <ExternalLink size={10} />
                  </a>
                {:else}
                  <span>{ref}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  {/if}
</section>
