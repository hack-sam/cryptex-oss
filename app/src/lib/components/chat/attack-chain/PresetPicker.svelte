<script lang="ts">
  import { PRESETS } from '$lib/chat/attack-chain-presets';
  import { Combobox, type ComboboxOption } from '$lib/components/ui/combobox';
  import Sparkles from 'lucide-svelte/icons/sparkles';

  type Props = {
    isDirty: boolean;
    onApply: (layers: string[]) => void;
  };
  let { isDirty, onApply }: Props = $props();

  // Keep the last-applied preset persistent so the Combobox trigger label
  // reflects which preset is currently active.
  let picked = $state<string>('');

  const options = $derived<ComboboxOption[]>(
    PRESETS.map((p) => ({
      id: p.id,
      label: p.name,
      description: `${p.layers.length} layers — ${p.description}`
    }))
  );

  const selectedPreset = $derived(PRESETS.find((p) => p.id === picked) ?? null);

  function handleChange(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    if (isDirty) {
      const ok = confirm('Replace current chain with preset?');
      if (!ok) { picked = ''; return; }
    }
    onApply([...preset.layers]);
    picked = id;
  }
</script>

<div class="flex flex-col gap-1.5">
  <label class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
    <Sparkles size={10} /> Presets
  </label>
  <Combobox
    value={picked}
    {options}
    placeholder="— pick a preset —"
    onChange={handleChange}
  />
  {#if selectedPreset}
    <p class="text-[10px] leading-snug text-muted-foreground">{selectedPreset.description}</p>
  {/if}
</div>
