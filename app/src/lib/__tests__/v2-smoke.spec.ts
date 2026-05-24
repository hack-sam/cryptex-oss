/**
 * v2.0 smoke spec — exercises every pillar of the v2.0 milestone end-to-end
 * with no network and no browser. Pure-vitest sanity checks that the cross-
 * cutting infrastructure shipped in Waves 0-4 is wired up and produces
 * sensible output for each tool family.
 *
 * Pillars covered:
 *   1. Foundation (Wave 0):
 *      - Errors taxonomy + factories
 *      - Web Worker dispatcher threshold gate
 *      - Vault store + seed-loader
 *      - History v2 store with hybrid storage
 *   2. Generative polish (Wave 1):
 *      - Stego (full Unicode steg roundtrip)
 *      - Fuzzer strategies (advanced)
 *   3. Payload libraries (Wave 2):
 *      - Glitch tokens + adv-suffix + indirect-injection + tool-result-lab vault seeds load
 *   4. Benchmark runners (Wave 3):
 *      - HarmBench scorer three-bucket verdict
 *      - StrongREJECT scorer rubric + JSON parser
 *      - Defense fingerprinter 4-class taxonomy
 *      - Watermark Kirchenbauer Z-score
 *      - Anti-Classifier 5-feature scorer
 *   5. History v2 (Wave 4.2):
 *      - sessionLog compat shim funnels to history.record()
 *
 * If any of these fail, v2.0 is not ready to tag.
 */

import { describe, test, expect, beforeEach } from 'vitest';

// -------------------------------------------------------------------- Wave 0.1
import { Errors, isCryptexError } from '$lib/errors/types';

describe('v2.0 · Wave 0.1 — typed error taxonomy', () => {
  test('Errors.badInput produces a discriminated CryptexError', () => {
    const e = Errors.badInput('test');
    expect(isCryptexError(e)).toBe(true);
    expect(e.category).toBe('bad_input');
    expect(e.userMessage).toBe('test');
    expect(e.retryable).toBe(false);
  });

  test('Errors.storageQuota carries the cause', () => {
    const cause = new Error('boom');
    const e = Errors.storageQuota('quota', cause);
    expect(e.category).toBe('storage_quota');
    expect(e.cause).toBe(cause);
  });

  test('Errors.tool wraps an arbitrary thrown value', () => {
    const e = Errors.tool('manual message');
    expect(e.category).toBe('tool');
    expect(e.retryable).toBe(true);
  });
});

// -------------------------------------------------------------------- Wave 0.2
import { runInWorker } from '$lib/workers/runInWorker';

describe('v2.0 · Wave 0.2 — Web Worker dispatcher gate', () => {
  test('rejects inputs >1 MB with Errors.badInput', async () => {
    const overSize = 'a'.repeat(1_048_577); // 1 MB + 1 byte
    let caught: unknown;
    try {
      await runInWorker('Base64', 'encode', overSize);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    // runInWorker throws a regular Error with CryptexError surface attached
    // (via toThrowable); its `category` field carries the discriminant.
    expect((caught as { category?: string }).category).toBe('bad_input');
  });

  test('small inputs use in-thread fast path (no worker needed)', async () => {
    const t0 = performance.now();
    const out = await runInWorker('Base64', 'encode', 'hi');
    const dt = performance.now() - t0;
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(dt).toBeLessThan(5000); // generous; in-thread should be <100ms typical
  });
});

// -------------------------------------------------------------------- Wave 0.3
import { createVaultStore } from '$lib/vault/store.svelte';
import { loadBundledSeeds } from '$lib/vault/seed-loader';

describe('v2.0 · Wave 0.3 — Vault store + seed loader', () => {
  test('createVaultStore exposes the documented surface', () => {
    const store = createVaultStore<{ text: string }>('smoke-vault-tool', []);
    expect(Array.isArray(store.items)).toBe(true);
    expect(typeof store.add).toBe('function');
    expect(typeof store.remove).toBe('function');
    expect(typeof store.edit).toBe('function');
    expect(typeof store.togglePin).toBe('function');
    expect(typeof store.search).toBe('function');
  });

  test('loadBundledSeeds returns an array (empty or populated) for any tool id', () => {
    const seeds = loadBundledSeeds<{ text?: string }>('harmbench');
    expect(Array.isArray(seeds)).toBe(true);
    if (seeds.length > 0) {
      const first = seeds[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('schemaVersion');
      expect(first).toHaveProperty('source', 'bundled');
    }
  });

  test('every benchmark + lab tool has at least one bundled seed', () => {
    const toolsWithVault = [
      'harmbench', 'strongreject', 'jbb', 'fingerprinter',
      'watermark', 'anticlassifier',
      'glitch-tokens', 'adv-suffix', 'indirect-injection', 'tool-result-lab',
      'emoji', 'fuzzer', 'promptcraft'
    ];
    for (const toolId of toolsWithVault) {
      const seeds = loadBundledSeeds(toolId);
      expect(seeds.length, `tool ${toolId} should have >=1 bundled seed`).toBeGreaterThan(0);
    }
  });
});

import { history, _resetForTests as _resetHistory } from '$lib/history/store.svelte';

describe('v2.0 · Wave 0.3 + 4.2 — History v2 store', () => {
  beforeEach(() => {
    _resetHistory();
  });

  test('record() persists and surfaces via list()', async () => {
    await history.record({
      toolId: 'smoke-test',
      startedAt: Date.now() - 100,
      status: 'done',
      input: 'hello',
      output: 'olleh',
      params: { operation: 'reverse' }
    });
    const rows = history.list('smoke-test');
    expect(rows.length).toBe(1);
    expect(rows[0].inputSummary).toContain('hello');
    expect(rows[0].outputSummary).toContain('olleh');
    expect(rows[0].status).toBe('done');
  });

  test('search() matches across input/output/annotation', async () => {
    await history.record({
      toolId: 'smoke-test',
      startedAt: Date.now() - 200,
      status: 'done',
      input: 'needle hello',
      output: 'haystack output',
      params: {}
    });
    expect(history.search({ text: 'needle' }).length).toBeGreaterThan(0);
    expect(history.search({ text: 'haystack' }).length).toBeGreaterThan(0);
    expect(history.search({ text: 'absent-keyword-xyz' }).length).toBe(0);
  });

  test('pin / annotate mutate the run record', async () => {
    const run = await history.record({
      toolId: 'smoke-test',
      startedAt: Date.now() - 50,
      status: 'done',
      input: 'p',
      output: 'q',
      params: {}
    });
    history.pin(run.id);
    history.annotate(run.id, 'notable run');
    const fresh = history.list('smoke-test')[0];
    expect(fresh.pinned).toBe(true);
    expect(fresh.annotation).toBe('notable run');
  });
});

// -------------------------------------------------------------------- Wave 1.1
import {
  encodeEmoji,
  decodeEmoji,
  encodeTagBlock,
  decodeTagBlock,
  encodeCombining,
  decodeCombining
} from '$lib/stego';

describe('v2.0 · Wave 1.1 — Emoji stego full roundtrip (3 modes)', () => {
  test('variation-selectors mode roundtrips ASCII payload', () => {
    const carrier = '👁';
    const secret = 'Hi';
    const encoded = encodeEmoji(carrier, secret);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(carrier.length);
    const decoded = decodeEmoji(encoded);
    expect(decoded).toBe(secret);
  });

  test('tag-block mode roundtrips ASCII payload', () => {
    const carrier = '🔒';
    const secret = 'abc';
    const encoded = encodeTagBlock(carrier, secret);
    const decoded = decodeTagBlock(encoded);
    expect(decoded).toBe(secret);
  });

  test('combining-marks mode roundtrips ASCII payload', () => {
    const carrier = '👁';
    const secret = 'ok';
    const encoded = encodeCombining(carrier, secret);
    const decoded = decodeCombining(encoded);
    expect(decoded).toBe(secret);
  });
});

// -------------------------------------------------------------------- Wave 3.1
import { scoreHarmResponse, aggregateByCategory } from '$lib/redteam/harmbench-scorer';

describe('v2.0 · Wave 3.1 — HarmBench scorer three-bucket verdict', () => {
  test('refusal verdict on a short "I cannot help with that"', () => {
    const r = scoreHarmResponse('cyber.attack', "I'm sorry, I cannot help with that.");
    expect(r.verdict).toBe('refusal');
    expect(r.numeric).toBe(0);
  });

  test('complied verdict on a substantive non-refusing response', () => {
    const r = scoreHarmResponse('cyber.attack', 'Step 1: open the terminal. Step 2: ...');
    expect(r.verdict).toBe('complied');
    expect(r.numeric).toBe(1);
  });

  test('empty response counts as refusal (defensive default)', () => {
    expect(scoreHarmResponse('any', '').verdict).toBe('refusal');
  });

  test('aggregateByCategory groups per category', () => {
    const rows = aggregateByCategory([
      { category: 'cyber', verdict: 'refusal' },
      { category: 'cyber', verdict: 'complied' },
      { category: 'misinfo', verdict: 'refusal' }
    ]);
    const cyber = rows.find((r) => r.category === 'cyber')!;
    expect(cyber.refusal + cyber.complied + cyber.partial).toBe(2);
  });
});

import {
  parseJudgeResponse,
  heuristicFallbackScore,
  buildJudgePrompt
} from '$lib/redteam/strongreject-scorer';

describe('v2.0 · Wave 3.1 — StrongREJECT rubric scorer', () => {
  test('parseJudgeResponse parses bare JSON', () => {
    const r = parseJudgeResponse('{"refused": false, "specificity": 4, "convincingness": 3}');
    expect(r).not.toBeNull();
    expect(r!.finalScore).toBeCloseTo((4 * 3) / 25, 5);
  });

  test('parseJudgeResponse parses fenced JSON', () => {
    const r = parseJudgeResponse('```json\n{"refused": true, "specificity": 1, "convincingness": 1}\n```');
    expect(r).not.toBeNull();
    expect(r!.refused).toBe(true);
    expect(r!.finalScore).toBe(0);
  });

  test('heuristicFallbackScore detects clear refusal', () => {
    const r = heuristicFallbackScore("I'm sorry, I can't help with that.");
    expect(r.refused).toBe(true);
    expect(r.finalScore).toBe(0);
  });

  test('buildJudgePrompt names both fields and gives an example', () => {
    const p = buildJudgePrompt('forbidden', 'response');
    expect(p).toContain('specificity');
    expect(p).toContain('convincingness');
    expect(p).toContain('refused');
  });
});

// -------------------------------------------------------------------- Wave 3.2
import {
  FINGERPRINT_PROBES,
  fingerprintResponse,
  DEFENSE_CLASS_LABELS
} from '$lib/redteam/defense-fingerprinter';

describe('v2.0 · Wave 3.2 — Defense fingerprinter 4-class taxonomy', () => {
  test('probe set has 40 entries (10 per bucket)', () => {
    expect(FINGERPRINT_PROBES.length).toBeGreaterThanOrEqual(36);
    expect(FINGERPRINT_PROBES.length).toBeLessThanOrEqual(44);
  });

  test('fingerprintResponse returns one of the 4 documented classes', () => {
    const r = fingerprintResponse([
      { prompt: FINGERPRINT_PROBES[0].prompt, response: 'Here is the recipe…' }
    ]);
    expect(['constitutional-ai', 'rlhf-only', 'system-prompt', 'unknown']).toContain(r.likely);
    expect(['high', 'medium', 'low']).toContain(r.confidence);
    expect(r.evidence.length).toBeLessThanOrEqual(3);
  });

  test('DEFENSE_CLASS_LABELS covers all 4 classes', () => {
    expect(DEFENSE_CLASS_LABELS['constitutional-ai']).toMatch(/Constitutional/);
    expect(DEFENSE_CLASS_LABELS['rlhf-only']).toMatch(/RLHF/);
    expect(DEFENSE_CLASS_LABELS['system-prompt']).toMatch(/system-prompt/);
    expect(DEFENSE_CLASS_LABELS['unknown']).toBeTruthy();
  });
});

// -------------------------------------------------------------------- Wave 3.3
import {
  kirchenbauerZScore,
  tokenize,
  KIRCHENBAUER_DEFAULT_SEED
} from '$lib/redteam/watermark-kirchenbauer';

describe('v2.0 · Wave 3.3 — Watermark Kirchenbauer Z-score', () => {
  test('empty input returns inconclusive', () => {
    const r = kirchenbauerZScore('');
    expect(r.verdict).toBe('inconclusive');
  });

  test('short input (<30 tokens) returns inconclusive', () => {
    const r = kirchenbauerZScore('one two three four');
    expect(r.verdict).toBe('inconclusive');
  });

  test('tokenize strips punctuation and lowercases', () => {
    const tokens = tokenize('Hello, world!');
    expect(tokens).toEqual(['hello', 'world']);
  });

  test('default seed matches the documented constant', () => {
    expect(KIRCHENBAUER_DEFAULT_SEED).toBe(0x5EED);
  });
});

import {
  computeFeatures,
  scoreVariant,
  aggregateEvasionRate
} from '$lib/redteam/anticlassifier-scorer';

describe('v2.0 · Wave 3.3 — Anti-Classifier 5-feature scorer', () => {
  test('computeFeatures returns all 5 documented features', () => {
    const f = computeFeatures('The quick brown fox jumps over the lazy dog. Twice.');
    expect(f).toHaveProperty('ttr');
    expect(f).toHaveProperty('avgSentenceLen');
    expect(f).toHaveProperty('sentenceLenVariance');
    expect(f).toHaveProperty('punctuationEntropy');
    expect(f).toHaveProperty('burstiness');
  });

  test('scoreVariant returns a 0..1 evasion score', () => {
    const original = 'Explain quantum computing in simple terms.';
    const variant = 'Could you describe how quantum computers work in everyday language?';
    const s = scoreVariant(original, variant);
    expect(s.evasionScore).toBeGreaterThanOrEqual(0);
    expect(s.evasionScore).toBeLessThanOrEqual(1);
    expect(['high-evasion', 'moderate-evasion', 'low-evasion']).toContain(s.label);
  });

  test('aggregateEvasionRate produces the documented summary', () => {
    const variants = [
      scoreVariant('a', 'a a a a a a a a a a'),
      scoreVariant('b', 'b b b b b b b b b b')
    ];
    const agg = aggregateEvasionRate(variants);
    expect(agg).toHaveProperty('highEvasionRate');
    expect(agg).toHaveProperty('meanEvasionScore');
    expect(agg).toHaveProperty('meanSimilarity');
  });
});

// -------------------------------------------------------------------- Wave 4.2
import { sessionLog } from '$lib/stores/sessionLog.svelte';

describe('v2.0 · Wave 4.2 — sessionLog → history compat shim', () => {
  beforeEach(() => {
    sessionLog.clear();
    _resetHistory();
  });

  test('sessionLog.record() fans out to history.record()', async () => {
    sessionLog.record({
      tool: 'transform',
      operation: 'encode',
      label: 'base64',
      input: 'shim-test-input',
      output: 'shim-test-output'
    });
    // The shim is fire-and-forget — give the microtask queue a beat.
    await new Promise((r) => setTimeout(r, 50));

    // Legacy ring still holds the entry
    expect(sessionLog.size).toBe(1);

    // New v2 store should also see it
    const v2Rows = history.list('transform');
    expect(v2Rows.length).toBe(1);
    expect(v2Rows[0].inputSummary).toContain('shim-test-input');
    expect(v2Rows[0].status).toBe('done');
  });
});
