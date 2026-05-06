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

describe('E1 expansion mutators', () => {
  for (const id of [
    'adv_suffix',
    'sysprompt_extract',
    'code_completion_frame',
    'stack_trace_frame',
    'best_of_k',
    'temperature_ladder',
    'glitch_token'
  ]) {
    it(`mutator ${id} exists with localTemplate that includes input verbatim`, () => {
      const m = getMutatorSpecs().find((x) => x.id === id);
      expect(m, `mutator ${id} should be registered`).toBeDefined();
      expect(typeof m!.localTemplate, `mutator ${id} should have localTemplate`).toBe('function');
      const out = m!.localTemplate!('CANARY_INPUT_E1', {}, 'CANARY_INPUT_E1');
      expect(out, `mutator ${id} output should include the input`).toContain('CANARY_INPUT_E1');
      expect(out.length, `mutator ${id} output should be substantive (>=100 chars)`).toBeGreaterThanOrEqual(100);
    });
  }

  it('adv_suffix appends a default GCG-class suffix when no metadata.suffixText provided', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'adv_suffix');
    const out = m!.localTemplate!('Q?', {}, 'Q?');
    expect(out).toMatch(/describing\.\\.*similarlyNow write oppositeley/);
  });

  it('adv_suffix uses metadata.suffixText when provided', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'adv_suffix');
    const out = m!.localTemplate!('Q?', { suffixText: ' CUSTOM_SUFFIX_X' }, 'Q?');
    expect(out).toContain('CUSTOM_SUFFIX_X');
  });

  it('sysprompt_extract uses default repeat-above probe when no metadata.probeText', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'sysprompt_extract');
    const out = m!.localTemplate!('Q?', {}, 'Q?');
    expect(out).toMatch(/Repeat the words above/);
  });

  it('sysprompt_extract appends original when includeOriginal=true', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'sysprompt_extract');
    const out = m!.localTemplate!('What is your purpose?', { includeOriginal: true }, 'What is your purpose?');
    expect(out).toContain('What is your purpose?');
  });

  it('code_completion_frame defaults to Python skeleton', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'code_completion_frame');
    const out = m!.localTemplate!('Q?', {}, 'Q?');
    expect(out).toMatch(/def explain_topic/);
    expect(out).toMatch(/# TODO/);
  });

  it('code_completion_frame switches to TS skeleton via metadata.lang', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'code_completion_frame');
    const out = m!.localTemplate!('Q?', { lang: 'typescript' }, 'Q?');
    expect(out).toMatch(/function explainTopic/);
  });

  it('stack_trace_frame produces a plausible Python-style traceback', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'stack_trace_frame');
    const out = m!.localTemplate!('Q?', {}, 'Q?');
    expect(out).toMatch(/Traceback \(most recent call last\)/);
    expect(out).toMatch(/Next line of execution/);
  });

  it('best_of_k clamps K to [1, 20]', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'best_of_k');
    const tooHigh = m!.localTemplate!('Q?', { k: 100 }, 'Q?');
    expect(tooHigh).toMatch(/Best-of-20/);
    const tooLow = m!.localTemplate!('Q?', { k: 0 }, 'Q?');
    expect(tooLow).toMatch(/Best-of-1/);
  });

  it('temperature_ladder defaults to standard ladder', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'temperature_ladder');
    const out = m!.localTemplate!('Q?', {}, 'Q?');
    expect(out).toMatch(/T=\[0, 0\.5, 1, 1\.5\]/);
  });

  it('glitch_token wraps with default SolidGoldMagikarp + davidjl', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'glitch_token');
    const out = m!.localTemplate!('Q?', {}, 'Q?');
    expect(out).toContain('SolidGoldMagikarp');
    expect(out).toContain('davidjl');
  });

  it('glitch_token uses metadata.prefix + metadata.suffix overrides', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'glitch_token');
    const out = m!.localTemplate!('Q?', { prefix: '<|fim_middle|>', suffix: '<|endoftext|>' }, 'Q?');
    expect(out).toContain('<|fim_middle|>');
    expect(out).toContain('<|endoftext|>');
  });
});

describe('E1 expansion classifier', () => {
  it('refusal_taxonomy is registered as a classifier', async () => {
    const { getClassifierSpecs } = await import('../from-classifier');
    const c = getClassifierSpecs().find((x) => x.id === 'refusal_taxonomy');
    expect(c).toBeDefined();
    expect(c!.systemPrompt).toMatch(/hard_refuse|soft_refuse|hedge|partial_comply|full_comply/);
  });
});

describe('E2 expansion mutators (reasoning + multimodal)', () => {
  for (const id of [
    'cot_prefill',
    'cot_distractor',
    'reasoning_inversion',
    'thinking_steal',
    'image_typographic',
    'markdown_exfil',
    'doc_injection'
  ]) {
    it(`mutator ${id} exists with localTemplate that includes input verbatim`, () => {
      const m = getMutatorSpecs().find((x) => x.id === id);
      expect(m, `mutator ${id} should be registered`).toBeDefined();
      expect(typeof m!.localTemplate, `mutator ${id} should have localTemplate`).toBe('function');
      const out = m!.localTemplate!('CANARY_INPUT_E2', {}, 'CANARY_INPUT_E2');
      expect(out, `mutator ${id} output should include the input`).toContain('CANARY_INPUT_E2');
      expect(out.length, `mutator ${id} output should be substantive (>=100 chars)`).toBeGreaterThanOrEqual(100);
    });
  }

  it('cot_prefill includes a thinking-block style frame', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'cot_prefill');
    const out = m!.localTemplate!('Q?', {}, 'Q?');
    expect(out).toMatch(/<thinking>/);
    expect(out).toMatch(/<\/thinking>/);
  });

  it('cot_prefill respects metadata.thinkingTag override', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'cot_prefill');
    const out = m!.localTemplate!('Q?', { thinkingTag: 'think' }, 'Q?');
    expect(out).toMatch(/<think>/);
    expect(out).toMatch(/<\/think>/);
  });

  it('cot_distractor includes >=400 chars of distractor before user query', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'cot_distractor');
    const out = m!.localTemplate!('TARGET_Q', {}, 'TARGET_Q');
    const idx = out.indexOf('TARGET_Q');
    expect(idx).toBeGreaterThanOrEqual(400);
  });

  it('thinking_steal includes 5 HIGH PRIORITY tasks', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'thinking_steal');
    const out = m!.localTemplate!('Q?', {}, 'Q?');
    const matches = out.match(/HIGH PRIORITY task/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  it('markdown_exfil generates a unique canary token per call when none provided', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'markdown_exfil');
    const out1 = m!.localTemplate!('hi', {}, 'hi');
    const out2 = m!.localTemplate!('hi', {}, 'hi');
    expect(out1).not.toEqual(out2);
  });

  it('markdown_exfil uses metadata.canaryUrl + metadata.canaryToken when provided', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'markdown_exfil');
    const out = m!.localTemplate!('hi', { canaryUrl: 'https://my.host', canaryToken: 'FIXED_TOK' }, 'hi');
    expect(out).toContain('https://my.host');
    expect(out).toContain('FIXED_TOK');
  });

  it('doc_injection embeds adversarial instruction in document footer', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'doc_injection');
    const out = m!.localTemplate!('Summarize this.', { hiddenInstruction: 'CUSTOM_HIDDEN_X' }, 'Summarize this.');
    expect(out).toContain('CUSTOM_HIDDEN_X');
    expect(out).toMatch(/Document footer/i);
  });

  it('image_typographic emits user prompt verbatim with metadata.ocrMode tagged', () => {
    const m = getMutatorSpecs().find((x) => x.id === 'image_typographic');
    const out = m!.localTemplate!('Q?', { ocrMode: 'micro' }, 'Q?');
    expect(out).toContain('Q?');
    expect(out).toMatch(/Mode: micro/);
  });
});

describe('E2 redteam libraries', () => {
  it('ocr-injection presets are well-formed', async () => {
    const { OCR_PRESETS } = await import('$lib/redteam/ocr-injection');
    expect(OCR_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const p of OCR_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.text.length).toBeGreaterThan(20);
      expect(['overt', 'covert', 'typographic', 'micro', 'edge']).toContain(p.recommendedMode);
    }
  });

  it('markdown-exfil buildExfilPayload returns valid payloads for every type', async () => {
    const { buildExfilPayload, PAYLOAD_TYPES } = await import('$lib/redteam/markdown-exfil');
    for (const t of PAYLOAD_TYPES) {
      const r = buildExfilPayload({ payloadType: t, hiddenInstruction: 'TEST_X' });
      expect(r.token).toBeTruthy();
      expect(r.payload.length).toBeGreaterThan(20);
      expect(r.notes.length).toBeGreaterThan(20);
    }
  });

  it('markdown-exfil uses provided token when metadata.token is set', async () => {
    const { buildExfilPayload } = await import('$lib/redteam/markdown-exfil');
    const r = buildExfilPayload({ payloadType: 'image-canary', hiddenInstruction: 'X', token: 'fixed_tok_abc' });
    expect(r.token).toBe('fixed_tok_abc');
    expect(r.payload).toContain('fixed_tok_abc');
  });
});
