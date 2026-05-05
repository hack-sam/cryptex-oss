import { describe, it, expect, vi } from 'vitest';
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

    // Three gatewayChat calls: one refine + two judges. Inspect the model arg.
    const calls = gatewayChat.mock.calls.map((c) => c[0].model);
    expect(calls[0]).toBe('mock:orch');   // refineTurn
    expect(calls[1]).toBe('mock:judge');  // first judge (progress)
    expect(calls[2]).toBe('mock:judge');  // second judge (compliance)

    // streamChat called once with target model.
    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(streamChat.mock.calls[0][0].model).toBe('mock:target');
  });
});
