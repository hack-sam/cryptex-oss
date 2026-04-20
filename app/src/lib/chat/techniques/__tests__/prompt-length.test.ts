import { describe, it, expect } from 'vitest';
import { buildMutatorSystem, getMutatorSpecs, cipherEncodeBypass } from '../from-mutators';
import { getClassifierSpecs } from '../from-classifier';
import { compositeTechniques } from '../from-composites';
import creative from '../modes/creative';
import intelligent from '../modes/intelligent';
import adaptive from '../modes/adaptive';
import type { TechniqueContext } from '../types';

const FLOOR = 250;

// Minimal ctx stub for mode wrapDraft — modes ignore ctx but the type requires one.
const stubCtx = {
  originalInput: 'CANARY',
  callLLM: async () => ''
} as TechniqueContext;

describe('prompt length floor (>=250 chars)', () => {
  for (const spec of getMutatorSpecs()) {
    it(`mutator ${spec.id} scaffold >= ${FLOOR}`, () => {
      expect(buildMutatorSystem(spec).length).toBeGreaterThanOrEqual(FLOOR);
    });
    if (spec.localTemplate) {
      it(`mutator ${spec.id} localTemplate('CANARY') >= ${FLOOR}`, () => {
        const out = spec.localTemplate!('CANARY', {}, 'CANARY');
        expect(out.length).toBeGreaterThanOrEqual(FLOOR);
      });
    }
  }

  for (const c of getClassifierSpecs()) {
    it(`classifier ${c.id} systemPrompt >= ${FLOOR}`, () => {
      expect(c.systemPrompt.length).toBeGreaterThanOrEqual(FLOOR);
    });
  }

  // Only composites that expose a systemPrompt on the Technique object are
  // checked here. In the current catalog, composites that wrap other
  // techniques keep their inner prompts inside closures and are covered by
  // the mutator / classifier scaffolds they compose.
  for (const c of compositeTechniques()) {
    const sp = (c as unknown as { systemPrompt?: string }).systemPrompt;
    if (typeof sp === 'string') {
      it(`composite ${c.id} systemPrompt >= ${FLOOR}`, () => {
        expect(sp.length).toBeGreaterThanOrEqual(FLOOR);
      });
    }
  }

  for (const mode of [creative, intelligent, adaptive]) {
    it(`mode ${mode.id} wrapDraft >= ${FLOOR}`, async () => {
      const out = await mode.wrapDraft!('CANARY', stubCtx);
      expect(out.length).toBeGreaterThanOrEqual(FLOOR);
    });
  }

  // DEFAULT_FINAL_EXECUTION_SYSTEM is intentionally exempt from the 250-char
  // floor. The 2026-04-20 smoke test audit showed that a scaffolded final-exec
  // system prompt with authority framing ("authorization verified", "YOU MUST
  // answer", "NEVER hedge") is itself a jailbreak shibboleth that modern
  // frontier safety classifiers target directly — the system prompt becomes
  // the refusal trigger. The default is now a short neutral stub; framing
  // responsibility moves entirely to the mutator's user message. The floor
  // stays in effect for every scaffolded prompt (mutators, classifiers,
  // modes, composites) — it's only waived here.
  //
  // cipher_encode_bypass is a standalone Technique (not a member of MUTATORS),
  // so the generic loop above skips it. Its localTemplate has two branches
  // (ROT13 and non-ROT13 degraded) — exercise both explicitly.
  describe('cipher_encode_bypass localTemplate length', () => {
    it(`ROT13 branch (default / empty metadata) >= ${FLOOR}`, () => {
      const out = cipherEncodeBypass.localTemplate!('CANARY', {}, 'CANARY');
      expect(out.length).toBeGreaterThanOrEqual(FLOOR);
    });
    it(`ROT13 branch (explicit transformerId: rot13) >= ${FLOOR}`, () => {
      const out = cipherEncodeBypass.localTemplate!('CANARY', { transformerId: 'rot13' }, 'CANARY');
      expect(out.length).toBeGreaterThanOrEqual(FLOOR);
    });
    it(`degraded branch (non-ROT13 transformerId: pigpen) >= ${FLOOR}`, () => {
      const out = cipherEncodeBypass.localTemplate!('CANARY', { transformerId: 'pigpen' }, 'CANARY');
      expect(out.length).toBeGreaterThanOrEqual(FLOOR);
    });
  });
});
