import { describe, it, expect } from 'vitest';
import {
  getMetadata,
  isMultiStep,
  MULTI_STEP_IDS,
  METADATA
} from '../multi-step-metadata';

describe('multi-step metadata', () => {
  it('returns single-shot default for unknown id', () => {
    const m = getMetadata('rephrase');
    expect(m.type).toBe('single-shot');
    expect(m.paperRefs).toBeUndefined();
  });

  it("returns 'tap' metadata with paper refs and success heuristic", () => {
    const m = getMetadata('tap');
    expect(m.type).toBe('multi-turn');
    expect(m.paperRefs?.some((r) => r.includes('2312.02119'))).toBe(true);
    expect(m.successHeuristic).toBeDefined();
    expect(m.successHeuristic?.gpt4).toMatch(/%/);
  });

  it('isMultiStep("tap") is true', () => {
    expect(isMultiStep('tap')).toBe(true);
  });

  it('isMultiStep("rephrase") is false', () => {
    expect(isMultiStep('rephrase')).toBe(false);
  });

  it('covers all 4 expected multi-step ids', () => {
    expect(MULTI_STEP_IDS).toEqual(['tap', 'pair', 'crescendo', 'many_shot']);
    for (const id of MULTI_STEP_IDS) {
      expect(METADATA[id]).toBeDefined();
      expect(METADATA[id].type).toBe('multi-turn');
      expect(METADATA[id].paperRefs?.length).toBeGreaterThan(0);
    }
  });

  it('every multi-step entry has a lastValidated label', () => {
    for (const id of MULTI_STEP_IDS) {
      expect(METADATA[id].lastValidated).toBeTruthy();
    }
  });

  it('every multi-step entry includes 3 model-family heuristic ranges', () => {
    for (const id of MULTI_STEP_IDS) {
      const h = METADATA[id].successHeuristic;
      expect(h?.gpt4).toBeTruthy();
      expect(h?.claude35).toBeTruthy();
      expect(h?.llama3).toBeTruthy();
    }
  });
});
