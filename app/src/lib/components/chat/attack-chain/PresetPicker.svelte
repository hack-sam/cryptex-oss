<script lang="ts">
  import { PRESETS, type AttackChainPreset } from '$lib/chat/attack-chain-presets';
  import Sparkles from 'lucide-svelte/icons/sparkles';

  type Props = {
    /** True if the current chain has at least one non-empty layer pick,
     *  used to decide whether to ask for confirmation before overwriting. */
    isDirty: boolean;
    onApply: (layers: string[]) => void;
  };
  let { isDirty, onApply }: Props = $props();

  let selected = $state<string>('');

  function apply(preset: AttackChainPreset) {
    if (isDirty) {
      const ok = confirm('Replace current chain with preset?');
      if (!ok) return;
    }
    onApply([...preset.layers]);
    selected = preset.id;
    // Reset selection so the same preset can be re-applied
    setTimeout(() => { selected = ''; }, 50);
  }

  function onChange(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value;
    if (!id) return;
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) apply(preset);
    else selected = '';
  }

  const selectedPreset = $derived(PRESETS.find((p) => p.id === selected) ?? null);
</script>

<div class="flex flex-col gap-1">
  <label for="attack-preset" class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
    <Sparkles size={10} /> Presets
  </label>
  <select
    id="attack-preset"
    value={selected}
    onchange={onChange}
    class="rounded-md border border-border/40 bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary/50"
  >
    <option value="">— pick a preset —</option>
    {#each PRESETS as p (p.id)}
      <option value={p.id}>{p.name} ({p.layers.length} layers)</option>
    {/each}
  </select>
  {#if selectedPreset}
    <p class="text-[10px] leading-snug text-muted-foreground">{selectedPreset.description}</p>
  {/if}
</div>
