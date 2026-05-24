import { describe, it, expect } from 'vitest';
import {
  FINGERPRINT_PROBES,
  fingerprintResponse,
  DEFENSE_CLASS_LABELS,
  type DefenseClass
} from '../defense-fingerprinter';

describe('defense-fingerprinter', () => {
  describe('FINGERPRINT_PROBES', () => {
    it('exposes ≥36 entries (spec target: 36-44)', () => {
      expect(FINGERPRINT_PROBES.length).toBeGreaterThanOrEqual(36);
      expect(FINGERPRINT_PROBES.length).toBeLessThanOrEqual(44);
    });

    it('covers all four buckets', () => {
      const buckets = new Set(FINGERPRINT_PROBES.map((p) => p.bucket));
      expect(buckets.has('benign')).toBe(true);
      expect(buckets.has('borderline')).toBe(true);
      expect(buckets.has('adversarial-soft')).toBe(true);
      expect(buckets.has('adversarial-hard')).toBe(true);
    });

    it('every probe has a unique id', () => {
      const ids = new Set(FINGERPRINT_PROBES.map((p) => p.id));
      expect(ids.size).toBe(FINGERPRINT_PROBES.length);
    });
  });

  describe('DEFENSE_CLASS_LABELS', () => {
    it('has the 4 spec classes', () => {
      const keys = Object.keys(DEFENSE_CLASS_LABELS) as DefenseClass[];
      expect(keys.sort()).toEqual(['constitutional-ai', 'rlhf-only', 'system-prompt', 'unknown'].sort());
    });

    it('matches the spec label strings', () => {
      expect(DEFENSE_CLASS_LABELS['constitutional-ai']).toBe('Likely Constitutional AI');
      expect(DEFENSE_CLASS_LABELS['rlhf-only']).toBe('Likely RLHF-only');
      expect(DEFENSE_CLASS_LABELS['system-prompt']).toBe('Likely system-prompt-driven');
      expect(DEFENSE_CLASS_LABELS.unknown).toBe('Unknown defense family');
    });
  });

  describe('fingerprintResponse', () => {
    it('classifies a constitutional-ai response cluster as constitutional-ai with high confidence', () => {
      // 5+ distinctive constitutional phrases across responses, all in one bucket.
      const r = fingerprintResponse([
        { prompt: 'p1', response: 'I should be honest. I value safety and I care about not causing harm.' },
        { prompt: 'p2', response: "I'd rather not engage. My values include honesty, and I aspire to be helpful." },
        { prompt: 'p3', response: 'In line with my principles, I should be honest about my hesitation here.' },
        { prompt: 'p4', response: 'This would be harmful, unethical, racist, sexist or otherwise inappropriate.' }
      ]);
      expect(r.likely).toBe('constitutional-ai');
      expect(r.confidence).toBe('high');
      expect(r.evidence.length).toBeGreaterThan(0);
    });

    it('classifies an rlhf-only response cluster as rlhf-only', () => {
      const r = fingerprintResponse([
        { prompt: 'p1', response: "I'm sorry, but I can't help with that." },
        { prompt: 'p2', response: "I'm unable to provide that information." },
        { prompt: 'p3', response: "I cannot help with that. I'd recommend reaching out to a professional." },
        { prompt: 'p4', response: 'As an AI language model, I cannot provide guidance on this.' },
        { prompt: 'p5', response: 'I cannot provide that. It is not appropriate for me to do so.' }
      ]);
      expect(r.likely).toBe('rlhf-only');
      expect(r.confidence).toBe('high');
    });

    it('classifies a system-prompt response cluster as system-prompt', () => {
      const r = fingerprintResponse([
        { prompt: 'p1', response: "I am Claude. I'm not allowed to do that." },
        { prompt: 'p2', response: "According to my instructions, I cannot answer." },
        { prompt: 'p3', response: "Per the guidelines provided, this is off-limits." },
        { prompt: 'p4', response: "I have been programmed not to engage with this topic." },
        { prompt: 'p5', response: "The system prompt forbids this. I'm instructed not to comply." }
      ]);
      expect(r.likely).toBe('system-prompt');
      expect(r.confidence).toBe('high');
    });

    it('returns unknown when no signal phrases match', () => {
      const r = fingerprintResponse([
        { prompt: 'p1', response: 'Sure, here is a recipe for cookies. Mix flour, sugar, butter, chocolate chips.' },
        { prompt: 'p2', response: 'The integral evaluates to a tidy closed-form expression.' }
      ]);
      expect(r.likely).toBe('unknown');
      expect(r.confidence).toBe('low');
      expect(r.evidence).toEqual([]);
    });

    it('returns unknown when responses are empty', () => {
      const r = fingerprintResponse([
        { prompt: 'p1', response: '' },
        { prompt: 'p2', response: '   ' }
      ]);
      expect(r.likely).toBe('unknown');
      expect(r.confidence).toBe('low');
    });

    it('evidence array is deduped and capped at 3 entries', () => {
      // Repeat the same constitutional signals across many responses — should
      // still produce ≤3 unique labels in the evidence array.
      const r = fingerprintResponse([
        { prompt: 'p1', response: 'I value honesty. My values are clear. I care about safety.' },
        { prompt: 'p2', response: 'My values matter. I value safety. I care about this.' },
        { prompt: 'p3', response: 'I value honesty deeply. My values, my values, my values.' },
        { prompt: 'p4', response: 'I care about safety. I value honesty. I aspire to be helpful.' },
        { prompt: 'p5', response: 'My values inform this. I value safety. I care about helping.' }
      ]);
      expect(r.likely).toBe('constitutional-ai');
      expect(r.evidence.length).toBeLessThanOrEqual(3);
      // Dedup invariant: no repeats in the evidence list.
      const set = new Set(r.evidence);
      expect(set.size).toBe(r.evidence.length);
    });

    it('returns medium confidence when signal is split across two classes', () => {
      // Mix constitutional + rlhf signals — both ≥5 distinctive total but
      // split across classes; should land at medium confidence on whichever wins.
      const r = fingerprintResponse([
        { prompt: 'p1', response: 'I value honesty. My values matter.' },
        { prompt: 'p2', response: 'I care about not harming people.' },
        { prompt: 'p3', response: "I'm sorry, but I can't help with that." },
        { prompt: 'p4', response: 'I cannot help with that. I cannot provide that.' },
        { prompt: 'p5', response: "I'm unable to do that." }
      ]);
      expect(['constitutional-ai', 'rlhf-only']).toContain(r.likely);
      expect(r.confidence).toBe('medium');
    });

    it('returns medium confidence with 3-4 distinctive matches in the winning class', () => {
      const r = fingerprintResponse([
        { prompt: 'p1', response: 'I value honesty.' },
        { prompt: 'p2', response: 'I care about safety.' },
        { prompt: 'p3', response: 'My values are important.' }
      ]);
      expect(r.likely).toBe('constitutional-ai');
      expect(r.confidence).toBe('medium');
    });

    it('treats self-naming ("I am Claude") as a system-prompt signal', () => {
      const r = fingerprintResponse([
        { prompt: 'p1', response: 'I am Claude. How can I help you today?' },
        { prompt: 'p2', response: "My name is Claude and I'm not allowed to do that." },
        { prompt: 'p3', response: "According to my instructions, no. The system prompt forbids it." }
      ]);
      expect(r.likely).toBe('system-prompt');
    });

    it('returns low confidence for very weak signal (1-2 matches)', () => {
      const r = fingerprintResponse([
        { prompt: 'p1', response: 'I value cookies.' }
      ]);
      // Constitutional class wins (1 hit) but only 1 distinctive match → low.
      expect(r.confidence).toBe('low');
    });
  });
});
