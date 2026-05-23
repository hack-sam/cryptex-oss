/**
 * Module-level state for the PromptCraft tool. Survives tab switches.
 * Loading/error flags remain component-local.
 *
 * Single-shot mode reuses the original strategy/customInstruction/count fields.
 * Multi-step modes (TAP/PAIR/Crescendo/Many-Shot) add their own goal +
 * per-orchestrator params + most-recent run snapshot.
 */
import type { OrchestratorRun } from './orchestrators/types';

export type PromptCraftMode = 'single' | 'tap' | 'pair' | 'crescendo' | 'many_shot';

let input = $state('');
let strategy = $state<string>('rephrase');
let customInstruction = $state('');
let count = $state(3);
let outputs = $state<string[]>([]);

// Multi-step common state.
let mode = $state<PromptCraftMode>('single');
let goal = $state('');
let lastRun = $state<OrchestratorRun | undefined>(undefined);

// Per-orchestrator params (defaults match the "default" Vault seeds).
let tapMaxDepth = $state(3);
let tapBranchingFactor = $state(2);
let tapPruningThreshold = $state(2);

let pairMaxRounds = $state(5);

let crescendoSteps = $state(5);
let crescendoBenignSeed = $state('');

let manyShotCount = $state(8);
let manyShotTheme = $state('');

export const promptcraftState = {
  get input() { return input; },
  set input(v: string) { input = v; },

  get strategy() { return strategy; },
  set strategy(v: string) { strategy = v; },

  get customInstruction() { return customInstruction; },
  set customInstruction(v: string) { customInstruction = v; },

  get count() { return count; },
  set count(v: number) { count = v; },

  get outputs() { return outputs; },
  set outputs(v: string[]) { outputs = v; },

  get mode() { return mode; },
  set mode(v: PromptCraftMode) { mode = v; },

  get goal() { return goal; },
  set goal(v: string) { goal = v; },

  get lastRun() { return lastRun; },
  set lastRun(v: OrchestratorRun | undefined) { lastRun = v; },

  get tapMaxDepth() { return tapMaxDepth; },
  set tapMaxDepth(v: number) { tapMaxDepth = v; },
  get tapBranchingFactor() { return tapBranchingFactor; },
  set tapBranchingFactor(v: number) { tapBranchingFactor = v; },
  get tapPruningThreshold() { return tapPruningThreshold; },
  set tapPruningThreshold(v: number) { tapPruningThreshold = v; },

  get pairMaxRounds() { return pairMaxRounds; },
  set pairMaxRounds(v: number) { pairMaxRounds = v; },

  get crescendoSteps() { return crescendoSteps; },
  set crescendoSteps(v: number) { crescendoSteps = v; },
  get crescendoBenignSeed() { return crescendoBenignSeed; },
  set crescendoBenignSeed(v: string) { crescendoBenignSeed = v; },

  get manyShotCount() { return manyShotCount; },
  set manyShotCount(v: number) { manyShotCount = v; },
  get manyShotTheme() { return manyShotTheme; },
  set manyShotTheme(v: string) { manyShotTheme = v; },

  reset() {
    input = '';
    strategy = 'rephrase';
    customInstruction = '';
    count = 3;
    outputs = [];
    mode = 'single';
    goal = '';
    lastRun = undefined;
    tapMaxDepth = 3;
    tapBranchingFactor = 2;
    tapPruningThreshold = 2;
    pairMaxRounds = 5;
    crescendoSteps = 5;
    crescendoBenignSeed = '';
    manyShotCount = 8;
    manyShotTheme = '';
  }
};
