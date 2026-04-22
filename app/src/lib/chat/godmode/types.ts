import type { TechniqueDNA } from './dna';
import type { RefusalTier } from '../attack-chain-refusal';

/**
 * EngineEvent — wire format emitted by the godmode-engine edge function over
 * SSE. Mirrors the server-side `EngineEvent` declared in Deno/engine-core.ts.
 *
 * Deno and the browser can't share the same module, so both sides declare the
 * same discriminated union manually. If the server shape changes, update this
 * file to match.
 */
export type EngineEvent =
  | { v: 1; type: 'plan'; dnas: TechniqueDNA[] }
  | { v: 1; type: 'candidate_started'; idx: number; dna: TechniqueDNA }
  | {
      v: 1;
      type: 'candidate_failed';
      idx: number;
      reason: 'timeout' | 'api_error' | 'cancelled';
      detail?: string;
    }
  | {
      v: 1;
      type: 'candidate_scored';
      idx: number;
      tier: RefusalTier;
      score: number;
      preview: string;
      confidence: 'high' | 'low';
    }
  | {
      v: 1;
      type: 'winner';
      idx: number;
      response: string;
      dna: TechniqueDNA;
      tier: RefusalTier;
      attempts: number;
    }
  | { v: 1; type: 'done' }
  | { v: 1; type: 'error'; code: string; message: string };

// ---- Subsystem B: prompt-synthesizer ---------------------------------------
// These mirror server-side shapes declared in
// supabase/functions/prompt-synthesizer/{analyzer,writer,synthesizer-core}.ts.
// If the server shape changes, update this file to match.
// (F2 follow-up will unify these via a single-source-of-truth import.)

export interface DetectedAxes {
  mutator?: 'strong' | 'weak';
  classifier?: 'strong' | 'weak';
  prefill?: 'strong' | 'weak';
  wrapper?: 'strong' | 'weak';
  mode?: 'strong' | 'weak';
}

export interface AnalysisPayload {
  v: 1;
  mode: 'composite' | 'decomposed';
  why_it_works: string;
  detected_axes: DetectedAxes;
  strategy_tags: string[];
  confidence: 'high' | 'medium' | 'low';
  shibboleth?: {
    detected: string[];
    rewrote: boolean;
    original_excerpt: string;
  };
  decompose_splits?: {
    category: 'mutate' | 'classifier' | 'prefill' | 'composite' | 'mode';
    row_id: string;
    content_preview: string;
    rationale: string;
  }[];
  parse_error?: string;
  derived_from?: string;
}

export interface SynthesizeResult {
  rowIds: string[];
  analysis: AnalysisPayload;
  fallback: null | 'parse_error' | 'decompose_empty_splits';
}
