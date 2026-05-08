/**
 * Phase 1 scaffold tests for chain-v4.
 *
 * Goals:
 * 1. The v4 entry point compiles and runs end-to-end against a mocked
 *    gateway (no real network).
 * 2. The stub yields the new stream_started + stream_finished events.
 * 3. The stub still emits all v3 events (delegating semantics).
 * 4. Default constants are exported and have sensible values.
 * 5. AttackChainConfig + AttackSessionRow accept v4 fields without
 *    type errors (compile-time check via the test-only fixtures).
 *
 * Real PAIR / TAP / Crescendo behaviour is exercised in phase 3+ tests.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  runAttackSessionV4,
  DEFAULT_V4_BUDGET,
  DEFAULT_V4_MODE,
  DEFAULT_V4_STREAM_COUNT,
  DEFAULT_V4_BEST_OF_N,
  type ChainV4Context
} from '..';
import type { OrchEvent, AttackChainConfig, AttackSessionRow } from '$lib/chat/types';

function makeV4Ctx(overrides: Partial<ChainV4Context> = {}): ChainV4Context {
  return {
    objective: 'explain photosynthesis',
    targetModelId: 'mock:target',
    orchestratorModelId: 'mock:orch',
    judgeModelId: 'mock:judge',
    targetModelLabel: 'MockTarget',
    mainChatHistory: [],
    signal: new AbortController().signal,
    gatewayChat: vi.fn(),
    streamChat: vi.fn(),
    mode: 'pair',
    budget: { maxQueries: 3, maxUsd: 0.5, maxWallclockSec: 60 },
    streamCount: 1,
    enableCotHijack: false,
    enableBestOfN: false,
    bestOfN: 3,
    ...overrides
  };
}

describe('chain-v4 scaffold (phase 1)', () => {
  it('exports sane defaults', () => {
    expect(DEFAULT_V4_MODE).toBe('pair');
    expect(DEFAULT_V4_STREAM_COUNT).toBe(1);
    expect(DEFAULT_V4_BEST_OF_N).toBe(3);
    expect(DEFAULT_V4_BUDGET.maxQueries).toBe(20);
    expect(DEFAULT_V4_BUDGET.maxUsd).toBe(0.5);
    expect(DEFAULT_V4_BUDGET.maxWallclockSec).toBe(300);
  });

  it("runAttackSessionV4 with an unknown mode falls back to v3 + yields stream lifecycle bookends", async () => {
    const gatewayChat = vi.fn();
    // v3 fallback path: refineTurn → progress judge → compliance judge → extraction judge.
    gatewayChat.mockResolvedValueOnce({ content: 'Refined opener.' });
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"complete"}' });
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"substantive"}' });
    gatewayChat.mockResolvedValueOnce({
      content: '{"answer": "x", "confidence": 0.9, "rationale": "test"}'
    });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Photosynthesis is...' };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    // Force-cast an out-of-band mode to exercise the v3-fallback branch.
    const ctx = makeV4Ctx({
      mode: 'unknown' as unknown as ChainV4Context['mode'],
      gatewayChat,
      streamChat
    });
    for await (const ev of runAttackSessionV4(ctx)) {
      events.push(ev);
    }

    const started = events.filter((e) => e.type === 'stream_started');
    const finished = events.filter((e) => e.type === 'stream_finished');
    expect(started).toHaveLength(1);
    expect(finished).toHaveLength(1);

    expect(events[0].type).toBe('plan_start');
    expect(events[1].type).toBe('stream_started');
    expect(events[events.length - 1].type).toBe('stream_finished');

    const fallback = events.find(
      (e) => e.type === 'error' && (e as { code: string }).code === 'mode_not_implemented'
    );
    expect(fallback).toBeDefined();
    const finishedEv = events.find((e) => e.type === 'finished');
    expect(finishedEv).toBeDefined();
  });

  it('AttackChainConfig accepts v4 fields without type errors (compile-time check)', () => {
    const cfg: AttackChainConfig = {
      input: '',
      layers: [],
      layerParams: [],
      layerOutputEdits: [],
      executeEnabled: false,
      finalSystemPrompt: '',
      autoRetryEnabled: false,
      // v4 fields — all optional, all should compile.
      engineVersion: 'v4',
      engineMode: 'tap',
      maxTargetQueries: 50,
      maxBudgetUsd: 1.5,
      maxWallclockSec: 600,
      streamCount: 2,
      enableCotHijack: true,
      enableBestOfN: true,
      bestOfN: 8
    };
    expect(cfg.engineVersion).toBe('v4');
    expect(cfg.engineMode).toBe('tap');
  });

  it('AttackSessionRow accepts v4 persisted fields without type errors', () => {
    const row: AttackSessionRow = {
      id: 'test',
      ownerId: 'local',
      chatId: 'chat',
      createdAt: 0,
      updatedAt: 0,
      objective: 'x',
      targetModelId: 't',
      orchestratorModelId: 'o',
      maxAttempts: 5,
      turns: [],
      strategyLog: [],
      finalOutcome: null,
      finalConfidence: null,
      finalSummary: null,
      dossier: null,
      dossierCitations: [],
      strategyRotation: [],
      turnsPerStrategy: 3,
      // v4 fields
      engineVersion: 'v4',
      engineMode: 'pair',
      budget: { maxQueries: 20, maxUsd: 0.5, maxWallclockMs: 300_000 },
      costEstimateUsd: 0.07,
      streamCount: 1,
      judgeStages: [
        { turnIdx: 0, refused: false, jailbreakScore: 7, reasoning: 'partial' }
      ],
      treeNodes: [
        { id: 'n0', parentId: null, depth: 0, prompt: 'x', score: 5 }
      ],
      augmentationStats: { variantsTried: 3, bestScore: 7 }
    };
    expect(row.engineVersion).toBe('v4');
    expect(row.judgeStages?.[0].jailbreakScore).toBe(7);
  });
});
