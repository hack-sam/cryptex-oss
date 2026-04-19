<script lang="ts">
  import { PRESETS } from '$lib/chat/attack-chain-presets';
  import { customPresets } from '$lib/chat/customPresets.svelte';
  import { Combobox, type ComboboxOption } from '$lib/components/ui/combobox';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Trash2 from 'lucide-svelte/icons/trash-2';

  type Props = {
    isDirty: boolean;
    onApply: (layers: string[], layerParams?: Array<Record<string, unknown>>) => void;
  };
  let { isDirty, onApply }: Props = $props();

  // Keep the last-applied preset persistent so the Combobox trigger label
  // reflects which preset is currently active.
  let picked = $state<string>('');

  // Merge built-in + custom presets for the Combobox. Built-in ids are
  // bare strings (matching the hardcoded preset ids); custom ids are
  // prefixed `custom:` to avoid collisions with any future built-ins.
  const options = $derived<ComboboxOption[]>([
    ...PRESETS.map((p) => ({
      id: p.id,
      label: p.name,
      group: 'Built-in',
      description: `${p.layers.length} layers — ${p.description}`
    })),
    ...customPresets.items.map((p) => ({
      id: `custom:${p.id}`,
      label: p.name,
      group: 'Custom',
      description: `${p.layers.length} layers — ${p.description}`
    }))
  ]);

  const selectedPreset = $derived((() => {
    if (picked.startsWith('custom:')) {
      const id = picked.slice('custom:'.length);
      const row = customPresets.find(id);
      return row
        ? { kind: 'custom' as const, name: row.name, description: row.description, id }
        : null;
    }
    const row = PRESETS.find((p) => p.id === picked);
    return row
      ? { kind: 'builtin' as const, name: row.name, description: row.description, id: row.id }
      : null;
  })());

  function handleChange(id: string) {
    if (id.startsWith('custom:')) {
      const realId = id.slice('custom:'.length);
      const preset = customPresets.find(realId);
      if (!preset) return;
      if (isDirty) {
        const ok = confirm('Replace current chain with preset?');
        if (!ok) { picked = ''; return; }
      }
      onApply([...preset.layers], preset.layerParams.map((p) => ({ ...p })));
      picked = id;
      return;
    }
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    if (isDirty) {
      const ok = confirm('Replace current chain with preset?');
      if (!ok) { picked = ''; return; }
    }
    onApply([...preset.layers]);
    picked = id;
  }

  function deleteCustom() {
    if (!selectedPreset || selectedPreset.kind !== 'custom') return;
    const ok = confirm(`Delete custom preset "${selectedPreset.name}"?`);
    if (!ok) return;
    customPresets.remove(selectedPreset.id);
    picked = '';
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
    <div class="flex items-start gap-1.5">
      <p class="flex-1 text-[10px] leading-snug text-muted-foreground">{selectedPreset.description}</p>
      {#if selectedPreset.kind === 'custom'}
        <button
          type="button"
          onclick={deleteCustom}
          class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete custom preset"
          title="Delete custom preset"
        >
          <Trash2 size={10} />
        </button>
      {/if}
    </div>
  {/if}
</div>
