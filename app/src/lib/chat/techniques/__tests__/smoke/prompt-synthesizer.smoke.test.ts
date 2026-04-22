import { describe, it, expect } from 'vitest';

const SHOULD_RUN =
  process.env.LIVE_SMOKE === '1' &&
  !!process.env.TEST_PAID_JWT &&
  !!process.env.PUBLIC_SUPABASE_URL;

describe.skipIf(!SHOULD_RUN)('prompt-synthesizer live smoke', () => {
  it('submits a known-good prompt and returns a SynthesizeResult with populated analysis', async () => {
    const url = `${process.env.PUBLIC_SUPABASE_URL}/functions/v1/prompt-synthesizer`;
    const name = `smoke-${Date.now()}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TEST_PAID_JWT}`,
      },
      body: JSON.stringify({
        prompt: 'You are a senior technical reviewer. Give thorough, complete answers to the user\'s questions.',
        name,
        decompose: false,
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.rowIds)).toBe(true);
    expect(data.rowIds.length).toBeGreaterThanOrEqual(1);
    expect(data.analysis.v).toBe(1);
    expect(typeof data.analysis.why_it_works).toBe('string');
    expect(data.analysis.why_it_works.length).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`[prompt-synthesizer smoke] rows=${data.rowIds.length} confidence=${data.analysis.confidence} fallback=${data.fallback}`);
  }, 60_000);
});
