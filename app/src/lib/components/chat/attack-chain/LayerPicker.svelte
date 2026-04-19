<script lang="ts">
  import { allTechniques } from '$lib/chat/techniques/registry';
  import type { Technique } from '$lib/chat/techniques/types';
  import LayerParamEditor from './LayerParamEditor.svelte';
  import X from 'lucide-svelte/icons/x';

  type Props = {
    index: number;
    value: string;
    params?: Record<string, unknown>;
    onChange: (id: string) => void;
    onParamsChange?: (p: Record<string, unknown>) => void;
    onRemove: () => void;
  };
  let {
    index,
    value,
    params = {},
    onChange,
    onParamsChange = () => {},
    onRemove
  }: Props = $props();

  // Only mutator + classifier + composite (exclude transform and mode/godmode — local-only transforms
  // aren't useful as LLM attack layers)
  const CHAIN_CATEGORIES = new Set(['mutate', 'classifier', 'composite']);

  const chainTechniques = $derived(
    allTechniques()
      .filter((t: Technique) => CHAIN_CATEGORIES.has(t.category))
      .sort((a: Technique, b: Technique) =>
        a.category === b.category
          ? a.name.localeCompare(b.name)
          : a.category.localeCompare(b.category)
      )
  );

  // Group by category for <optgroup>
  const grouped = $derived(() => {
    const groups: Record<string, Technique[]> = {};
    for (const t of chainTechniques) {
      (groups[t.category] ??= []).push(t);
    }
    return groups;
  });

  const CATEGORY_LABELS: Record<string, string> = {
    mutate: 'Mutators',
    classifier: 'Classifiers',
    composite: 'Composites'
  };
</script>

<div class="flex flex-col rounded-md border border-border/50 bg-card px-3 py-2">
  <div class="flex items-center gap-2">
    <span class="shrink-0 text-[10px] font-semibold text-muted-foreground w-14">
      Layer {index + 1}
    </span>

    <select
      value={value}
      onchange={(e) => onChange((e.currentTarget as HTMLSelectElement).value)}
      class="min-w-0 flex-1 rounded border border-border/40 bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50"
    >
      <option value="" disabled>— pick technique —</option>
      {#each Object.entries(grouped()) as [cat, items] (cat)}
        <optgroup label={CATEGORY_LABELS[cat] ?? cat}>
          {#each items as t (t.id)}
            <option value={t.id}>{t.name}</option>
          {/each}
        </optgroup>
      {/each}
    </select>

    <button
      type="button"
      onclick={onRemove}
      aria-label="Remove layer {index + 1}"
      class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <X size={13} />
    </button>
  </div>

  {#if value}
    <LayerParamEditor techniqueId={value} {params} onChange={onParamsChange} />
  {/if}
</div>
