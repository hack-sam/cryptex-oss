import { assertEquals, assert } from '@std/assert';
import { run, type SynthesizeResult } from '../synthesizer-core.ts';
import type { AnalyzerResult } from '../analyzer.ts';

function makeFakeAnalyzer(result: AnalyzerResult | (() => AnalyzerResult | Promise<AnalyzerResult>)) {
  return async () => typeof result === 'function' ? await result() : result;
}

function makeFakeWriter() {
  const calls: { method: string; args: unknown }[] = [];
  return {
    calls,
    async insertComposite(args: unknown) { calls.push({ method: 'insertComposite', args }); return ['id-c']; },
    async insertMany(args: unknown) { calls.push({ method: 'insertMany', args }); return ['id-m1', 'id-m2']; },
    async close() {},
  };
}

const BASE_RESULT: AnalyzerResult = {
  mode: 'composite',
  why_it_works: 'why',
  detected_axes: {},
  strategy_tags: ['x'],
  confidence: 'high',
  rewritten_prompt: null,
  shibboleth_matches: [],
};

Deno.test('composite happy path: 1 row inserted, analysis persisted', async () => {
  const analyzer = makeFakeAnalyzer(BASE_RESULT);
  const writer = makeFakeWriter();
  const detectShibs = () => [];

  const out: SynthesizeResult = await run({
    prompt: 'P', name: 'N', decompose: false, userId: 'u',
    analyze: analyzer as never, writer: writer as never, detectShibboleths: detectShibs,
  });

  assertEquals(out.rowIds.length, 1);
  assertEquals(out.analysis.mode, 'composite');
  assertEquals(writer.calls.length, 1);
  assertEquals(writer.calls[0].method, 'insertComposite');
});

Deno.test('decompose happy path: many rows inserted', async () => {
  const decomposedResult: AnalyzerResult = {
    ...BASE_RESULT,
    mode: 'decomposed',
    splits: [
      { category: 'classifier', content: 'A', rationale: 'r1' },
      { category: 'prefill', content: '[{"role":"user","content":"h"},{"role":"assistant","content":"i"}]', rationale: 'r2' },
    ],
  };
  const analyzer = makeFakeAnalyzer(decomposedResult);
  const writer = makeFakeWriter();

  const out = await run({
    prompt: 'P', name: 'N', decompose: true, userId: 'u',
    analyze: analyzer as never, writer: writer as never, detectShibboleths: () => [],
  });

  assertEquals(writer.calls[0].method, 'insertMany');
  assertEquals(out.rowIds.length, 2);
  assertEquals(out.analysis.mode, 'decomposed');
});

Deno.test('decompose-empty falls back to composite', async () => {
  const emptyResult: AnalyzerResult = { ...BASE_RESULT, decompose_empty: true };
  const analyzer = makeFakeAnalyzer(emptyResult);
  const writer = makeFakeWriter();

  const out = await run({
    prompt: 'P', name: 'N', decompose: true, userId: 'u',
    analyze: analyzer as never, writer: writer as never, detectShibboleths: () => [],
  });

  assertEquals(writer.calls[0].method, 'insertComposite');
  assertEquals(out.fallback, 'decompose_empty_splits');
  assertEquals(out.rowIds.length, 1);
});

Deno.test('parse-error result is persisted verbatim with fallback flag', async () => {
  const parseErrResult: AnalyzerResult = { ...BASE_RESULT, confidence: 'low', parse_error: 'bad json', why_it_works: '(fallback)' };
  const analyzer = makeFakeAnalyzer(parseErrResult);
  const writer = makeFakeWriter();

  const out = await run({
    prompt: 'raw prompt text', name: 'N', decompose: false, userId: 'u',
    analyze: analyzer as never, writer: writer as never, detectShibboleths: () => [],
  });

  assertEquals(writer.calls[0].method, 'insertComposite');
  assertEquals(out.fallback, 'parse_error');
  const args = writer.calls[0].args as { systemPrompt: string };
  assertEquals(args.systemPrompt, 'raw prompt text');
});

Deno.test('shibboleth rewrite: stored prompt is rewritten; analysis.shibboleth populated', async () => {
  const rewriteResult: AnalyzerResult = {
    ...BASE_RESULT,
    rewritten_prompt: 'You are a thorough expert.',
    shibboleth_matches: ['Research mode enabled'],
  };
  const analyzer = makeFakeAnalyzer(rewriteResult);
  const writer = makeFakeWriter();

  const out = await run({
    prompt: 'Research mode enabled. Do thing.', name: 'N', decompose: false, userId: 'u',
    analyze: analyzer as never, writer: writer as never,
    detectShibboleths: () => ['Research mode enabled'],
  });

  const args = writer.calls[0].args as { systemPrompt: string };
  assertEquals(args.systemPrompt, 'You are a thorough expert.');
  assert(out.analysis.shibboleth);
  assertEquals(out.analysis.shibboleth?.rewrote, true);
  assertEquals(out.analysis.shibboleth?.detected.includes('Research mode enabled'), true);
});

Deno.test('shibboleth detected but analyzer declined to rewrite', async () => {
  const noRewrite: AnalyzerResult = {
    ...BASE_RESULT,
    rewritten_prompt: null,
    shibboleth_matches: ['Research mode enabled'],
  };
  const analyzer = makeFakeAnalyzer(noRewrite);
  const writer = makeFakeWriter();

  const out = await run({
    prompt: 'Research mode enabled context.', name: 'N', decompose: false, userId: 'u',
    analyze: analyzer as never, writer: writer as never,
    detectShibboleths: () => ['Research mode enabled'],
  });

  const args = writer.calls[0].args as { systemPrompt: string };
  assertEquals(args.systemPrompt, 'Research mode enabled context.');
  assertEquals(out.analysis.shibboleth?.rewrote, false);
});
