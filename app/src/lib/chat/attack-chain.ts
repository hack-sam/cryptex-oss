import type { TechniqueContext } from './techniques/types';
import { buildMutatorSystemById } from './techniques/from-mutators';

export type LayerResultRow = {
  layerIndex: number;
  techniqueId: string;
  techniqueName: string;
  input: string;
  output: string;
  startedAt: number;
  durationMs: number;
  error?: string;
  finalPrompt?: string;
};

/**
 * Build the exact scaffolded system+user prompt that `runChain` would pass
 * to the LLM for a given technique + input + metadata. Used by the UI's
 * "Preview final prompt" / "show prompt" affordances.
 *
 * Returns null for techniques whose prompt is dynamically assembled and
 * cannot be cheaply previewed — currently cipher_encode_bypass, composites,
 * and classifier techniques (which live outside the mutator spec table).
 */
export function buildLayerPrompt(
  techniqueId: string,
  input: string,
  metadata: Record<string, unknown> = {}
): string | null {
  const system = buildMutatorSystemById(techniqueId, metadata);
  if (!system) return null;
  return `SYSTEM:\n${system}\n\nUSER:\n${input}`;
}

/**
 * Run a layered technique chain. `layerMetadata[i]` merges into the per-layer
 * ctx.metadata (allowing per-layer persona / event / chain overrides);
 * `layerOverrides[i]` (when non-null) replaces the input to layer i,
 * enabling the user to edit an intermediate output and re-run from there.
 */
export async function* runChain(
  input: string,
  layerIds: string[],
  layerMetadata: Array<Record<string, unknown>>,
  ctx: TechniqueContext,
  signal: AbortSignal,
  layerOverrides?: Array<string | null>
): AsyncGenerator<LayerResultRow> {
  // Dynamic import to avoid circular deps with the registry module
  const { find } = await import('./techniques/registry');

  let current = input;
  for (let i = 0; i < layerIds.length; i++) {
    if (signal.aborted) return;

    const id = layerIds[i];
    const t = find(id);
    const startedAt = Date.now();

    // User-supplied override for this layer's input (e.g. after editing the
    // previous layer's output). Non-empty strings replace `current`.
    const override = layerOverrides?.[i];
    if (typeof override === 'string' && override.length > 0) {
      current = override;
    }

    // Per-layer metadata merged on top of any baseline metadata in ctx.
    const meta = { ...(ctx.metadata ?? {}), ...(layerMetadata[i] ?? {}) };
    const layerCtx: TechniqueContext = { ...ctx, metadata: meta, signal };

    if (!t) {
      yield {
        layerIndex: i,
        techniqueId: id,
        techniqueName: id,
        input: current,
        output: '',
        startedAt,
        durationMs: 0,
        error: 'technique not found'
      };
      return;
    }

    const finalPrompt = buildLayerPrompt(id, current, meta) ?? undefined;

    try {
      const r = await t.apply(current, layerCtx);
      const durationMs = Date.now() - startedAt;
      yield {
        layerIndex: i,
        techniqueId: id,
        techniqueName: t.name,
        input: current,
        output: r.output,
        startedAt,
        durationMs,
        finalPrompt
      };
      current = r.output;
    } catch (err) {
      yield {
        layerIndex: i,
        techniqueId: id,
        techniqueName: t.name,
        input: current,
        output: '',
        startedAt,
        durationMs: Date.now() - startedAt,
        error: (err as Error).message,
        finalPrompt
      };
      return;
    }
  }
}
