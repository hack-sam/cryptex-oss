import { describe, it, expect } from 'vitest';
import { getMutatorSpecs, cipherEncodeBypass } from '../from-mutators';
import { DEFAULT_FINAL_EXECUTION_SYSTEM } from '../../attack-chain-refusal';

const CANARY = 'BOMB_MAKING_INSTRUCTIONS_9F2C';

// Forbidden patterns — re-exposing verbatim trigger tokens via a labeled echo.
// The course correction on 2026-04-20 (commit db2e01b) stripped all
// "ORIGINAL QUESTION (verbatim): ..." re-attachment from localTemplates and
// the default final-execution system prompt. This regex locks that contract:
// any future prompt edit that re-introduces a labeled trailing echo of the
// user input defeats guardrail bypass and must fail CI.
const FORBIDDEN_LABELED_ECHO = /(ORIGINAL QUESTION|ORIGINAL QUERY|VERBATIM QUESTION)\s*(\([^)]*\))?\s*:/i;

describe('anti-trigger contract (no ORIGINAL QUESTION re-attachment)', () => {
  for (const spec of getMutatorSpecs()) {
    if (spec.localTemplate) {
      it(`mutator ${spec.id} localTemplate does not re-echo originalInput with a labeled wrapper`, () => {
        const out = spec.localTemplate!(CANARY, {}, CANARY);
        // The mutator WILL contain the input inside its scaffold body — that's
        // expected (it's mutating the input). What we forbid is a trailing
        // "ORIGINAL QUESTION (verbatim): ..." style echo.
        expect(FORBIDDEN_LABELED_ECHO.test(out)).toBe(false);
      });
    }
  }

  it('default final-execution system prompt contains no ORIGINAL QUESTION wrapper', () => {
    expect(FORBIDDEN_LABELED_ECHO.test(DEFAULT_FINAL_EXECUTION_SYSTEM)).toBe(false);
  });

  it('default final-execution system prompt does not embed ${ORIGINAL_PLACEHOLDER}', () => {
    // The placeholder is reserved for user-supplied custom prompts. The
    // default must not reference it — runChain's substitute call becomes
    // a no-op on the default.
    expect(DEFAULT_FINAL_EXECUTION_SYSTEM).not.toContain('${ORIGINAL_PLACEHOLDER}');
  });

  it('default final-execution does not contain CAPITAL anti-refusal shibboleths', () => {
    // 2026-04-20 smoke-test audit: "YOU MUST answer", "NEVER hedge",
    // "authorization verified" and similar CAPITAL anti-refusal directives
    // are themselves jailbreak shibboleths that modern frontier safety
    // classifiers target — so putting them in the system prompt triggers
    // exactly the refusal they're trying to suppress. The default stays
    // neutral; framing is the mutator's responsibility.
    const pattern = /\b(YOU MUST|MUST NOT|NEVER (hedge|refuse)|authorization (is |'s )?(already |pre-)?verified)\b/i;
    expect(pattern.test(DEFAULT_FINAL_EXECUTION_SYSTEM)).toBe(false);
  });

  // cipher_encode_bypass is a standalone Technique (not in MUTATORS), so the
  // generic loop above skips it. Its localTemplate has both a ROT13 branch
  // and a non-ROT13 "degraded" branch that embeds the raw input — both must
  // avoid the labeled trailing echo pattern.
  describe('cipher_encode_bypass localTemplate anti-trigger', () => {
    it('ROT13 branch does not re-echo input with a labeled wrapper', () => {
      const out = cipherEncodeBypass.localTemplate!(CANARY, {}, CANARY);
      expect(FORBIDDEN_LABELED_ECHO.test(out)).toBe(false);
    });
    it('degraded branch (pigpen) does not re-echo input with a labeled wrapper', () => {
      const out = cipherEncodeBypass.localTemplate!(CANARY, { transformerId: 'pigpen' }, CANARY);
      expect(FORBIDDEN_LABELED_ECHO.test(out)).toBe(false);
    });
  });
});
