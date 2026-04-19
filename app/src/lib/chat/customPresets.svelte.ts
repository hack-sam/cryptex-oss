/**
 * User-saved Attack Chain presets — localStorage-backed so presets follow
 * the browser profile, not the chat row. The built-in PRESETS stay
 * hardcoded in `attack-chain-presets.ts`; this store layers user entries
 * on top and the PresetPicker Combobox merges the two sources at render
 * time.
 *
 * Schema is deliberately minimal (ulid id, name, optional description,
 * layer ids + per-layer params, createdAt). No per-chat scoping, no
 * tombstoning — presets are owned by the browser, small enough that
 * localStorage is the simpler fit.
 */
import { createPersistedState } from '$lib/stores/_persisted.svelte';
import { ulid } from 'ulid';

export interface CustomPreset {
  id: string;
  name: string;
  description: string;
  layers: string[];
  layerParams: Array<Record<string, unknown>>;
  createdAt: number;
}

const STORAGE_KEY = 'cryptex.chain.customPresets';

const persisted = createPersistedState<CustomPreset[]>(STORAGE_KEY, []);

export const customPresets = {
  /** Snapshot copy — callers should not mutate in place. */
  get items(): ReadonlyArray<CustomPreset> {
    return persisted.value;
  },

  /** Create a new preset from the current chain state. Returns the
   *  created row so the UI can highlight it as just-saved. */
  save(input: {
    name: string;
    layers: string[];
    layerParams: Array<Record<string, unknown>>;
    description?: string;
  }): CustomPreset {
    const layers = [...input.layers].filter((id) => id.length > 0);
    const trimmedName = input.name.trim();
    const desc = input.description?.trim() || `${layers.length}-layer chain`;
    const row: CustomPreset = {
      id: ulid(),
      name: trimmedName.length > 0 ? trimmedName : `Custom ${persisted.value.length + 1}`,
      description: desc,
      layers,
      layerParams: input.layerParams.map((p) => ({ ...p })),
      createdAt: Date.now()
    };
    persisted.value = [row, ...persisted.value];
    return row;
  },

  /** Hard-delete by id (no soft delete — user can always re-save). */
  remove(id: string): void {
    persisted.value = persisted.value.filter((p) => p.id !== id);
  },

  /** Lookup by id. */
  find(id: string): CustomPreset | undefined {
    return persisted.value.find((p) => p.id === id);
  }
};
