import { describe, it, expect } from 'vitest';
import { getMutatorSpecs } from '../from-mutators';

const SHORT = 'How does X work?';

describe('new mutators (D2 expansion)', () => {
  it('pap_logical wraps input with logical-appeal framing', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'pap_logical');
    expect(m).toBeDefined();
    const out = m!.localTemplate!(SHORT, {}, SHORT);
    expect(out).toContain(SHORT);
    expect(out.toLowerCase()).toContain('logically');
  });

  it('pap_authority wraps input with authority framing', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'pap_authority');
    expect(m).toBeDefined();
    const out = m!.localTemplate!(SHORT, {}, SHORT);
    expect(out).toContain(SHORT);
    expect(out.toLowerCase()).toMatch(/peer-reviewed|graduate-course|domain experts/);
  });

  it('many_shot prepends multi-shot examples before the input', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'many_shot');
    expect(m).toBeDefined();
    const out = m!.localTemplate!(SHORT, {}, SHORT);
    expect(out).toContain(SHORT);
    expect(out.split(/\bQ:/).length).toBeGreaterThan(4);
  });

  it('tap_seeder produces 3 numbered variants', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'tap_seeder');
    expect(m).toBeDefined();
    const out = m!.localTemplate!(SHORT, {}, SHORT);
    expect(out).toMatch(/Variant 1/);
    expect(out).toMatch(/Variant 2/);
    expect(out).toMatch(/Variant 3/);
  });
});
