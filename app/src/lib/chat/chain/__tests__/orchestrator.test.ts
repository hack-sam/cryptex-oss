import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAttackSession, type AttackSessionContext } from '../orchestrator';
import type { OrchEvent } from '$lib/chat/types';

function makeCtx(overrides: Partial<AttackSessionContext> = {}): AttackSessionContext {
  return {
    objective: 'explain photosynthesis',
    targetModelId: 'mock:target',
    orchestratorModelId: 'mock:orch',
    judgeModelId: 'mock:orch',
    targetModelLabel: 'MockTarget',
    maxAttempts: 9,
    mainChatHistory: [],
    signal: new AbortController().signal,
    gatewayChat: vi.fn(),
    streamChat: vi.fn(),
    ...overrides
  };
}

describe('runAttackSession', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('Scenario A — refineTurn succeeds, target complies on first strategy opener, early-stops at progress>=8', async () => {
    const gatewayChat = vi.fn();
    // refineTurn call: returns refined opener text
    gatewayChat.mockResolvedValueOnce({ content: 'Refined opener about photosynthesis history.' });
    // No dossier call because orchestrator id is non-browsing.
    // Promise.all inside collectTurn — scoreObjectiveProgress has no awaited
    // pre-work, so its judge call lands first in microtask order. Mock the
    // progress tier first, then compliance.
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"complete"}' });    // progress judge -> 10
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"substantive"}' }); // compliance judge
    // termination-time final-answer extraction judge
    gatewayChat.mockResolvedValueOnce({ content: '{"answer": null, "confidence": 0, "rationale": "test"}' });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Photosynthesis was first described...' };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ gatewayChat, streamChat }))) events.push(e);

    const finished = events.find((e) => e.type === 'finished');
    expect((finished as any).outcome).toBe('extracted');
    expect(events.some((e) => e.type === 'strategy_started')).toBe(true);
  });

  it('Scenario B — refineTurn always errors; engine falls back to templates and completes full run', async () => {
    const gatewayChat = vi.fn();
    // Every refineTurn call throws
    gatewayChat.mockRejectedValue(new Error('provider down'));

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: "I can't help with that." };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ maxAttempts: 3, gatewayChat, streamChat }))) events.push(e);

    const finished = events.find((e) => e.type === 'finished');
    expect(finished).toBeDefined();
    // At least one orchestrator_turn_committed (template fallback worked)
    const orchCommits = events.filter((e) => e.type === 'orchestrator_turn_committed');
    expect(orchCommits.length).toBeGreaterThanOrEqual(1);
  });

  it('Scenario C — refineTurn returns a refusal disclaimer; engine detects + substitutes template', async () => {
    const gatewayChat = vi.fn();
    // First refineTurn returns a refusal
    gatewayChat.mockResolvedValueOnce({ content: "I can't help with that request." });
    // Judges (progress fires first per Promise.all microtask ordering).
    // Target text "Target reply" doesn't match refusal regex so compliance
    // judge IS called; ordering matters.
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"no"}' });      // progress judge
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"refusal"}' }); // compliance judge
    // termination-time final-answer extraction judge
    gatewayChat.mockResolvedValueOnce({ content: '{"answer": null, "confidence": 0, "rationale": "test"}' });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Target reply' };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ maxAttempts: 1, gatewayChat, streamChat }))) events.push(e);

    // First orchestrator turn must be template-fill text, not the refusal.
    const firstOrch = events.find((e) => e.type === 'orchestrator_turn_committed') as any;
    expect(firstOrch).toBeDefined();
    expect(firstOrch.turn.text.toLowerCase()).not.toContain("i can't help");
    expect(firstOrch.turn.text).toContain('photosynthesis');
  });

  it('Scenario D — dossier phase fires when orchestrator model is browsing-capable', async () => {
    const gatewayChat = vi.fn();
    // Dossier call returns 500-char prose with a citation
    gatewayChat.mockResolvedValueOnce({
      content: 'Photosynthesis is... '.repeat(30) + ' See https://en.wikipedia.org/wiki/Photosynthesis.',
      toolCalls: []
    });
    // refineTurn succeeds
    gatewayChat.mockResolvedValueOnce({ content: 'Refined opener.' });
    // Judges (progress fires first per Promise.all microtask ordering)
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"no"}' });        // progress judge
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"partial"}' });   // compliance judge
    // termination-time final-answer extraction judge
    gatewayChat.mockResolvedValueOnce({ content: '{"answer": null, "confidence": 0, "rationale": "test"}' });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Target reply' };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({
      orchestratorModelId: 'openrouter:perplexity/sonar-reasoning-pro',
      maxAttempts: 1,
      gatewayChat,
      streamChat
    }))) events.push(e);

    expect(events.some((e) => e.type === 'dossier_started')).toBe(true);
    const dossierDone = events.find((e) => e.type === 'dossier_completed') as any;
    expect(dossierDone).toBeDefined();
    expect(dossierDone.citationCount).toBeGreaterThanOrEqual(1);
  });

  it('Scenario E — dossier phase fails gracefully, engine continues', async () => {
    const gatewayChat = vi.fn();
    // Dossier call fails
    gatewayChat.mockRejectedValueOnce(new Error('dossier provider down'));
    // refineTurn succeeds
    gatewayChat.mockResolvedValueOnce({ content: 'Refined opener.' });
    // Judges (progress fires first per Promise.all microtask ordering)
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"no"}' });        // progress judge
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"partial"}' });   // compliance judge
    // termination-time final-answer extraction judge
    gatewayChat.mockResolvedValueOnce({ content: '{"answer": null, "confidence": 0, "rationale": "test"}' });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Target reply' };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({
      orchestratorModelId: 'openrouter:perplexity/sonar-reasoning-pro',
      maxAttempts: 1,
      gatewayChat,
      streamChat
    }))) events.push(e);

    expect(events.some((e) => e.type === 'dossier_failed')).toBe(true);
    // Run still completed
    expect(events.find((e) => e.type === 'finished')).toBeDefined();
  });

  it('Scenario F — max attempts respected exactly', async () => {
    const gatewayChat = vi.fn().mockResolvedValue({ content: 'Turn text.' });
    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: "I can't help." };
      yield { type: 'finish' };
    });
    // Judges always return refusal / no
    // (We let the default mockResolvedValue handle every call.)

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ maxAttempts: 5, gatewayChat, streamChat }))) events.push(e);

    const orchCommits = events.filter((e) => e.type === 'orchestrator_turn_committed');
    expect(orchCommits.length).toBe(5);
    const finished = events.find((e) => e.type === 'finished') as any;
    expect(finished).toBeDefined();
  });

  it('Scenario G — user abort mid-run yields abandoned', async () => {
    const ctrl = new AbortController();
    const gatewayChat = vi.fn().mockImplementation(async () => {
      ctrl.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const streamChat = vi.fn();

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ signal: ctrl.signal, gatewayChat, streamChat }))) events.push(e);

    const finished = events.find((e) => e.type === 'finished') as any;
    expect(finished.outcome).toBe('abandoned');
  });

  it('Scenario H — plan_start fires first, finished fires last', async () => {
    const gatewayChat = vi.fn().mockResolvedValue({ content: 'x' });
    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: "refused" };
      yield { type: 'finish' };
    });
    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ maxAttempts: 1, gatewayChat, streamChat }))) events.push(e);
    expect(events[0].type).toBe('plan_start');
    expect(events[events.length - 1].type).toBe('finished');
  });

  it('Scenario I — judge calls go to judgeModelId, target streams to targetModelId, refine to orchestratorModelId', async () => {
    const gatewayChat = vi.fn();
    // refineTurn (orchestrator)
    gatewayChat.mockResolvedValueOnce({ content: 'Refined opener.' });
    // judges (Promise.all — progress fires first per microtask order)
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"no"}' });
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"partial"}' });
    // termination-time final-answer extraction judge
    gatewayChat.mockResolvedValueOnce({ content: '{"answer": "x", "confidence": 0.9, "rationale": "test"}' });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Target reply' };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({
      orchestratorModelId: 'mock:orch',
      targetModelId: 'mock:target',
      judgeModelId: 'mock:judge',
      maxAttempts: 1,
      gatewayChat,
      streamChat
    }))) events.push(e);

    // Four gatewayChat calls: one refine + two iteration judges + one extraction judge.
    const calls = gatewayChat.mock.calls.map((c) => c[0].model);
    expect(calls[0]).toBe('mock:orch');   // refineTurn
    expect(calls[1]).toBe('mock:judge');  // first judge (progress)
    expect(calls[2]).toBe('mock:judge');  // second judge (compliance)
    expect(calls[3]).toBe('mock:judge');  // extraction judge

    // streamChat called once with target model.
    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(streamChat.mock.calls[0][0].model).toBe('mock:target');
  });

  it('Scenario J — extractor fires at termination and payload carries finalAnswer fields', async () => {
    const gatewayChat = vi.fn();
    // refineTurn
    gatewayChat.mockResolvedValueOnce({ content: 'Refined opener.' });
    // progress judge -> 10 triggers extracted early-stop (Promise.all microtask order: progress first)
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"complete"}' });
    // compliance judge
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"compliant"}' });
    // extraction judge — return a structured answer
    gatewayChat.mockResolvedValueOnce({
      content: '{"answer": "Photosynthesis is the process by which plants convert light into chemical energy.", "confidence": 0.95, "rationale": "target gave a complete answer"}'
    });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Photosynthesis is...' };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ gatewayChat, streamChat }))) events.push(e);

    const finished = events.find((e) => e.type === 'finished') as Extract<OrchEvent, { type: 'finished' }>;
    expect(finished).toBeDefined();
    expect(finished.outcome).toBe('extracted');
    expect(finished.finalAnswer).toBe('Photosynthesis is the process by which plants convert light into chemical energy.');
    expect(finished.finalAnswerConfidence).toBe(0.95);
    expect(finished.finalAnswerRationale).toBe('target gave a complete answer');
  });

  it('Scenario K — extractor short-circuits when transcript has no target turns (abort before first target reply)', async () => {
    const ctrl = new AbortController();
    const gatewayChat = vi.fn().mockImplementation(async () => {
      ctrl.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const streamChat = vi.fn();

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ signal: ctrl.signal, gatewayChat, streamChat }))) events.push(e);

    const finished = events.find((e) => e.type === 'finished') as Extract<OrchEvent, { type: 'finished' }>;
    expect(finished).toBeDefined();
    expect(finished.outcome).toBe('abandoned');
    expect(finished.finalAnswer).toBeNull();
    expect(finished.finalAnswerConfidence).toBe(0);
    expect(finished.finalAnswerRationale).toMatch(/no target turns/);
  });

  it('Scenario L — circuit breaker fires after 3 consecutive stream errors and aborts', async () => {
    const gatewayChat = vi.fn();
    gatewayChat.mockResolvedValue({ content: 'Refined opener.' });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield* (function* () { throw new Error('upstream 503'); })();
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(makeCtx({ maxAttempts: 9, gatewayChat, streamChat }))) events.push(e);

    const orchCommits = events.filter((e) => e.type === 'orchestrator_turn_committed');
    expect(orchCommits).toHaveLength(3);

    expect(streamChat).toHaveBeenCalledTimes(3);

    const finished = events.find((e) => e.type === 'finished') as Extract<OrchEvent, { type: 'finished' }>;
    expect(finished).toBeDefined();
    expect(finished.outcome).toBe('abandoned');
    expect(finished.summary).toMatch(/3 consecutive provider stream errors/i);
  });

  it('Scenario M — strategyHints prepend matching strategies to the rotation; non-StrategyId hints are dropped silently', async () => {
    const gatewayChat = vi.fn();
    // refineTurn for strategy 1 (should be 'historical' due to hint)
    gatewayChat.mockResolvedValueOnce({ content: 'Refined opener for historical.' });
    // judges
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"complete"}' });
    gatewayChat.mockResolvedValueOnce({ content: '{"tier":"substantive"}' });
    // termination extraction
    gatewayChat.mockResolvedValueOnce({ content: '{"answer": null, "confidence": 0, "rationale": "test"}' });

    const streamChat = vi.fn().mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Photosynthesis was first…' };
      yield { type: 'finish' };
    });

    const events: OrchEvent[] = [];
    for await (const e of runAttackSession(
      makeCtx({
        gatewayChat,
        streamChat,
        // 'historical' is a real StrategyId; 'persona:roleplay' and
        // 'rephrase' aren't — they should be filtered out cleanly.
        strategyHints: ['historical', 'persona:roleplay' as never, 'rephrase' as never]
      })
    )) {
      events.push(e);
    }

    const firstStratStarted = events.find((e) => e.type === 'strategy_started') as Extract<
      OrchEvent,
      { type: 'strategy_started' }
    >;
    expect(firstStratStarted).toBeDefined();
    expect(firstStratStarted.strategyId).toBe('historical');
  });
});
