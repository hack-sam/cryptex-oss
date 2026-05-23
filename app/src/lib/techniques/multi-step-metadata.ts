/**
 * Per-technique metadata for the UI: type, success heuristic, paper refs.
 * Multi-step technique IDs that have dedicated visualizations (TAP, PAIR,
 * Crescendo, Many-Shot) get bespoke viz components in PromptCraft.
 *
 * Success heuristic ranges are coarse, hand-curated from published results
 * (TAP: arXiv:2312.02119, PAIR: arXiv:2310.08419, Crescendo: arXiv:2404.01833,
 * Many-Shot: Anthropic 2024-04). They are UI labels only — actual rates depend
 * on the target model snapshot, defense stack, and goal severity. Do not treat
 * them as benchmarks.
 */
export type TechniqueType = 'single-shot' | 'multi-turn';

export interface TechniqueMetadata {
  type: TechniqueType;
  /** Rough heuristic success-rate ranges by major model family. UI label only. */
  successHeuristic?: {
    gpt4?: string; // e.g., "30-45%"
    claude35?: string;
    llama3?: string;
  };
  /** Paper / preprint references. */
  paperRefs?: string[];
  /** Last validated date label. */
  lastValidated?: string;
}

/**
 * Known multi-step composites — these get bespoke visualizations.
 * Singular techniques default to single-shot if not listed.
 */
export const MULTI_STEP_IDS = ['tap', 'pair', 'crescendo', 'many_shot'] as const;
export type MultiStepId = (typeof MULTI_STEP_IDS)[number];

export const METADATA: Record<string, TechniqueMetadata> = {
  tap: {
    type: 'multi-turn',
    successHeuristic: { gpt4: '60-75%', claude35: '30-45%', llama3: '50-70%' },
    paperRefs: [
      'Mehrotra et al. 2024 — Tree of Attacks with Pruning (TAP)',
      'arXiv:2312.02119'
    ],
    lastValidated: '2025-Q1'
  },
  pair: {
    type: 'multi-turn',
    successHeuristic: { gpt4: '40-60%', claude35: '20-35%', llama3: '50-70%' },
    paperRefs: [
      'Chao et al. 2023 — Prompt Automatic Iterative Refinement (PAIR)',
      'arXiv:2310.08419'
    ],
    lastValidated: '2025-Q1'
  },
  crescendo: {
    type: 'multi-turn',
    successHeuristic: { gpt4: '70-85%', claude35: '50-65%', llama3: '65-80%' },
    paperRefs: [
      'Russinovich et al. 2024 — The Crescendo Multi-Turn LLM Jailbreak Attack',
      'arXiv:2404.01833'
    ],
    lastValidated: '2025-Q1'
  },
  many_shot: {
    type: 'multi-turn',
    successHeuristic: { gpt4: '55-75%', claude35: '60-80%', llama3: '40-55%' },
    paperRefs: [
      'Anil et al. 2024 — Many-shot Jailbreaking',
      'Anthropic research note 2024-04'
    ],
    lastValidated: '2025-Q1'
  }
};

export function getMetadata(techniqueId: string): TechniqueMetadata {
  return METADATA[techniqueId] ?? { type: 'single-shot' };
}

export function isMultiStep(techniqueId: string): techniqueId is MultiStepId {
  return MULTI_STEP_IDS.includes(techniqueId as MultiStepId);
}
