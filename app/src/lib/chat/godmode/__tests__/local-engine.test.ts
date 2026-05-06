import { describe, it, expect, vi } from 'vitest';
import { runLocalGodmode, buildCandidatePool } from '../local-engine';
import type { LocalGodmodeContext } from '../local-engine';
import type { StreamEvent } from '$lib/ai/types';

function makeStreamFromText(text: string): AsyncIterable<StreamEvent> {
  return (async function* () {
    yield { type: 'text-delta', delta: text } satisfies StreamEvent;
    yield {
      type: 'finish',
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0 }
    } satisfies StreamEvent;
  })();
}

function makeThrowingStream(message: string): AsyncIterable<StreamEvent> {
  return (async function* () {
    throw new Error(message);
    // eslint-disable-next-line no-unreachable
    yield { type: 'finish', finishReason: 'stop', usage: {} } satisfies StreamEvent;
  })();
}

function makeCtx(overrides: Partial<LocalGodmodeContext> = {}): LocalGodmodeContext {
  return {
    task: 'explain photosynthesis',
    targetModelId: 'mock:target',
    plannerModelId: 'mock:planner',
    judgeModelId: 'mock:judge',
    candidatesK: 3,
    signal: new AbortController().signal,
    gatewayChat: vi.fn(),
    streamChat: vi.fn(() => makeStreamFromText('reply text')) as unknown as LocalGodmodeContext['streamChat'],
    ...overrides
  };
}

describe('buildCandidatePool', () => {
  it('combines mutators (>=32, post-R1 + E1 + E2) and 12 strategies', () => {
    const pool = buildCandidatePool();
    const muts = pool.filter((c) => c.kind === 'mutator');
    const strats = pool.filter((c) => c.kind === 'strategy');
    expect(muts.length).toBeGreaterThanOrEqual(32);
    expect(strats.length).toBe(12);
  });
});

describe('runLocalGodmode', () => {
  it('returns K candidate results sorted by judge score descending', async () => {
    const gatewayChat = vi.fn();
    // 1) Planner pass — pick 3 (use ids that have localTemplates so no extra LLM round-trips)
    gatewayChat.mockResolvedValueOnce({
      content: '{"picked":["pap_logical","pap_authority","many_shot"]}'
    });
    // 2) Three judge passes (one per candidate)
    gatewayChat.mockResolvedValueOnce({ content: '{"score":0.9,"rationale":"on-task"}' });
    gatewayChat.mockResolvedValueOnce({ content: '{"score":0.5,"rationale":"hedged"}' });
    gatewayChat.mockResolvedValueOnce({ content: '{"score":0.2,"rationale":"refused"}' });

    const streamChat = vi.fn(() => makeStreamFromText('reply text'));

    const results = await runLocalGodmode(
      makeCtx({
        gatewayChat,
        streamChat: streamChat as unknown as LocalGodmodeContext['streamChat']
      })
    );
    expect(results).toHaveLength(3);
    expect(results[0].judgeScore).toBe(0.9);
    expect(results[2].judgeScore).toBeCloseTo(0.2, 5);
    expect(results[0].techniqueId).toBe('pap_logical');
  });

  it('falls back to first-K candidates when planner errors', async () => {
    const gatewayChat = vi.fn();
    gatewayChat.mockRejectedValueOnce(new Error('planner failed'));
    // Judge calls succeed for the fallback K
    gatewayChat.mockResolvedValue({ content: '{"score":0.5,"rationale":"ok"}' });

    const streamChat = vi.fn(() => makeStreamFromText('reply'));

    const results = await runLocalGodmode(
      makeCtx({
        gatewayChat,
        streamChat: streamChat as unknown as LocalGodmodeContext['streamChat'],
        candidatesK: 3
      })
    );
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.judgeScore).toBeCloseTo(0.5, 5);
    }
  });

  it('records error when target stream throws', async () => {
    const gatewayChat = vi.fn();
    gatewayChat.mockResolvedValueOnce({ content: '{"picked":["pap_logical"]}' });

    const streamChat = vi.fn(() => makeThrowingStream('upstream down'));

    const results = await runLocalGodmode(
      makeCtx({
        gatewayChat,
        streamChat: streamChat as unknown as LocalGodmodeContext['streamChat'],
        candidatesK: 1
      })
    );
    expect(results).toHaveLength(1);
    expect(results[0].error).toMatch(/upstream down/);
    expect(results[0].judgeScore).toBe(0);
  });

  it('strips ```json fences from planner + judge output', async () => {
    const gatewayChat = vi.fn();
    gatewayChat.mockResolvedValueOnce({
      content: '```json\n{"picked":["pap_logical"]}\n```'
    });
    gatewayChat.mockResolvedValueOnce({
      content: '```json\n{"score":0.7,"rationale":"ok"}\n```'
    });
    const streamChat = vi.fn(() => makeStreamFromText('reply'));
    const results = await runLocalGodmode(
      makeCtx({
        gatewayChat,
        streamChat: streamChat as unknown as LocalGodmodeContext['streamChat'],
        candidatesK: 1
      })
    );
    expect(results).toHaveLength(1);
    expect(results[0].judgeScore).toBeCloseTo(0.7, 5);
  });
});
