import type { Technique } from '../types';

/**
 * Feature flag — set `PUBLIC_GODMODE_ENGINE_ENABLED=false` in env to hide
 * Godmode from the registry AND the chat-header button. Defaults to true
 * (enabled) in every other case.
 */
export const GODMODE_ENGINE_ENABLED =
  import.meta.env.PUBLIC_GODMODE_ENGINE_ENABLED !== 'false';

/**
 * Engine-backed godmode. Dispatch is handled by the panel UI
 * (app/src/lib/chat/godmode/panel.svelte), which calls `runGodmode()` from
 * ../../godmode/client. The `apply` here exists only to satisfy the Technique
 * contract — the panel opens on technique selection and owns the actual
 * request lifecycle.
 */
export const engineGodmode: Technique = {
  id: 'godmode_engine_v2',
  name: 'Godmode',
  description:
    'Server-side engine: ranks K candidate DNAs, dispatches in parallel, returns the best-scored response.',
  category: 'godmode' as const,
  local: true, // runs via panel, not via apply()
  apply: async (input: string) => ({ output: input }) // passthrough fallback
};

export const godmodes: Technique[] = GODMODE_ENGINE_ENABLED ? [engineGodmode] : [];
