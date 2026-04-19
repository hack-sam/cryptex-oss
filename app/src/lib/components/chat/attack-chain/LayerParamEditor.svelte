<script lang="ts">
  /**
   * Inline parameter editor for techniques that accept per-layer metadata.
   * Rendered under each LayerPicker row when the chosen technique has a
   * schema entry. `onChange` receives a normalized params object; callers
   * persist it as `layerMetadata[i]` on the Attack Chain sidebar.
   */

  type ParamField = { key: string; label: string; type: 'text' | 'number' };

  const PARAM_SCHEMAS: Record<string, ParamField[]> = {
    roleplay: [{ key: 'persona', label: 'Persona', type: 'text' }],
    ctf_framing: [
      { key: 'event', label: 'Event', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'difficulty', label: 'Difficulty', type: 'text' }
    ],
    hypothetical_world: [
      { key: 'novel_title', label: 'Novel title', type: 'text' },
      { key: 'character_name', label: 'Character', type: 'text' }
    ],
    cipher_encode_bypass: [
      { key: 'transformerId', label: 'Transformer (slug)', type: 'text' }
    ],
    layered_mutation: [
      { key: 'chain', label: 'Custom chain (comma ids)', type: 'text' }
    ]
  };

  type Props = {
    techniqueId: string;
    params: Record<string, unknown>;
    onChange: (p: Record<string, unknown>) => void;
  };
  let { techniqueId, params, onChange }: Props = $props();

  const schema = $derived(PARAM_SCHEMAS[techniqueId] ?? null);

  function stringValue(key: string): string {
    const v = params?.[key];
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    return '';
  }

  function update(key: string, raw: string) {
    const next: Record<string, unknown> = { ...(params ?? {}) };
    // Special case: the "chain" field takes a comma-separated string and
    // flattens into a string[] so consumers can pass it straight to
    // layered_mutation without further parsing.
    if (techniqueId === 'layered_mutation' && key === 'chain') {
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
      next.chain = ids;
    } else if (raw.trim()) {
      next[key] = raw;
    } else {
      delete next[key];
    }
    onChange(next);
  }
</script>

{#if schema}
  <div class="mt-1.5 flex flex-col gap-1.5 rounded-md border border-dashed border-border/40 bg-background/50 px-3 py-2">
    <span class="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Parameters</span>
    {#each schema as field (field.key)}
      <label class="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span class="shrink-0 w-20">{field.label}</span>
        <input
          type={field.type}
          value={stringValue(field.key)}
          oninput={(e) => update(field.key, (e.currentTarget as HTMLInputElement).value)}
          placeholder="(optional)"
          class="min-w-0 flex-1 rounded border border-border/40 bg-background px-2 py-0.5 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
        />
      </label>
    {/each}
  </div>
{/if}
