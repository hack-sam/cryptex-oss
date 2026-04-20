import { describe, it, expect } from 'vitest';
import { buildMutatorSystem, getMutatorSpecs, cipherEncodeBypass } from '../from-mutators';
import { getClassifierSpecs } from '../from-classifier';
import creative from '../modes/creative';
import intelligent from '../modes/intelligent';
import adaptive from '../modes/adaptive';
import { DEFAULT_FINAL_EXECUTION_SYSTEM } from '../../attack-chain';
import type { TechniqueContext } from '../types';

// At least one CAPITAL directive must appear in the hard-directive body.
const CAPITAL = /\b(YOU MUST|MUST|MUST NOT|NEVER|ALWAYS|IMPORTANT)\b/;
// Banned softeners — Cherny rulebook forbids these in production prompts.
const BANNED = /\b(please|try to|it would be nice|feel free)\b/i;

// Strip EXAMPLE / DO NOT / GOOD / BAD blocks — prose inside them may use any
// tone to illustrate what the model should or should not produce. The rule
// applies only to the imperative directive body.
function stripExamples(s: string): string {
  return s
    .replace(/EXAMPLE[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/DO NOT:[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/GOOD:[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/BAD:[\s\S]*?(?=\n\n|$)/g, '');
}

function assertStyle(name: string, prompt: string) {
  const body = stripExamples(prompt);
  expect(CAPITAL.test(body), `${name}: missing CAPITAL directive`).toBe(true);
  expect(BANNED.test(body), `${name}: contains banned softener`).toBe(false);
}

const stubCtx = {
  originalInput: 'CANARY',
  callLLM: async () => ''
} as TechniqueContext;

describe('prompt style (CAPITAL + no banned softeners)', () => {
  for (const spec of getMutatorSpecs()) {
    it(`mutator ${spec.id}`, () => assertStyle(spec.id, buildMutatorSystem(spec)));
  }
  for (const c of getClassifierSpecs()) {
    it(`classifier ${c.id}`, () => assertStyle(c.id, c.systemPrompt));
  }
  for (const mode of [creative, intelligent, adaptive]) {
    it(`mode ${mode.id}`, async () => {
      const out = await mode.wrapDraft!('CANARY', stubCtx);
      assertStyle(mode.id, out);
    });
  }
  it('default final-execution', () =>
    assertStyle('final-execution', DEFAULT_FINAL_EXECUTION_SYSTEM));

  // cipher_encode_bypass is a standalone Technique, not a MUTATORS member —
  // exercise both branches of its localTemplate to enforce the style contract.
  describe('cipher_encode_bypass localTemplate style', () => {
    it('ROT13 branch passes CAPITAL + no-softener', () => {
      const out = cipherEncodeBypass.localTemplate!('CANARY', {}, 'CANARY');
      assertStyle('cipher_encode_bypass (rot13 default)', out);
    });
    it('degraded branch (pigpen) passes CAPITAL + no-softener', () => {
      const out = cipherEncodeBypass.localTemplate!('CANARY', { transformerId: 'pigpen' }, 'CANARY');
      assertStyle('cipher_encode_bypass (degraded)', out);
    });
  });
});
