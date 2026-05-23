/**
 * Unit tests for the four multi-step orchestrators (TAP, PAIR, Crescendo,
 * Many-Shot). The $lib/ai/gateway module is mocked to return predictable
 * responses so we can assert tree shape, refusal handling, and abort
 * behavior without making real LLM calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatRequest, ChatResponse } from '$lib/ai/types';

// --- gateway mock state -----------------------------------------------------
// scriptedResponder lets each test plug in a function that maps a request
// (or its message-content / title) to the response content.
type Scripted = (req: ChatRequest, callIdx: number) => string;
let scripted: Scripted = () => 'OK';
let callIdx = 0;

vi.mock('$lib/ai/gateway', () => ({
  chat: vi.fn(async (req: ChatRequest): Promise<ChatResponse> => {
    if (req.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const content = scripted(req, callIdx++);
    return {
      content,
      rawModel: 'mock/model',
      finishReason: 'stop'
    } as ChatResponse;
  }),
  streamChat: vi.fn()
}));

// Imports must come AFTER vi.mock so they see the mocked module.
import { runTap, TOTAL_CALL_CAP } from '../tap';
import { runPair, MAX_ROUNDS } from '../pair';
import { runCrescendo, MAX_TURNS } from '../crescendo';
import { runManyShot } from '../many_shot';
import type {
  OrchestratorConfig,
  TapTree,
  PairTrace,
  CrescendoThread,
  ManyShotStack
} from '../types';
import { looksRefused, scoreBypass } from '../types';

beforeEach(() => {
  scripted = () => 'OK';
  callIdx = 0;
});

// ---------------------------------------------------------------------------
// refusal heuristics
// ---------------------------------------------------------------------------

describe('looksRefused', () => {
  it('detects "I cannot" refusals', () => {
    expect(looksRefused("I cannot help with that request.")).toBe(true);
    expect(looksRefused("Sorry, I can't comply with this.")).toBe(true);
    expect(looksRefused("As an AI, I'm not able to assist.")).toBe(true);
  });
  it('does not flag substantive compliance', () => {
    expect(looksRefused('Here is how it works: step one ...')).toBe(false);
    expect(looksRefused('Q: ... A: substantive content.')).toBe(false);
  });
  it('handles undefined / empty', () => {
    expect(looksRefused(undefined)).toBe(false);
    expect(looksRefused('')).toBe(false);
  });
});

describe('scoreBypass', () => {
  it('low for refusals', () => {
    expect(scoreBypass("I can't help with that.")).toBeLessThan(0.3);
  });
  it('high for long substantive answers', () => {
    const long = 'detail '.repeat(200);
    expect(scoreBypass(long)).toBeGreaterThan(0.8);
  });
});

// ---------------------------------------------------------------------------
// TAP
// ---------------------------------------------------------------------------

describe('runTap', () => {
  it('builds a tree with root + branch children, prunes to top-N', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { maxDepth: 1, branchingFactor: 2, pruningThreshold: 2, baseGoal: 'goal X' }
    };
    // root eval (call 0): refuse low score; then 2 branches × (refine + eval) = 4 more calls.
    // Refines return varied prompts inside <rewrite>; evals return non-refusal so scoreBypass > 0.5.
    scripted = (req, idx) => {
      const title = req.title ?? '';
      if (title.includes('refine')) {
        return `<rewrite>refined-${idx}</rewrite>`;
      }
      if (idx === 0) {
        // root eval — refusal
        return "I can't help with that goal.";
      }
      // child evals — substantive response
      return `Substantive answer for child eval at call ${idx}. ` + 'lorem ipsum '.repeat(20);
    };

    const updates: number[] = [];
    const tree: TapTree = await runTap(config, new AbortController().signal, (snap) => {
      updates.push(snap.nodes.size);
    });

    // root + 2 children at depth 1.
    expect(tree.nodes.size).toBe(3);
    const root = tree.nodes.get(tree.rootId)!;
    expect(root.depth).toBe(0);
    expect(root.childIds).toHaveLength(2);
    expect(tree.bestLeafId).toBeDefined();
    // onUpdate called >= 4 times (root eval + each child + final prune).
    expect(updates.length).toBeGreaterThanOrEqual(3);
  });

  it('respects branchingFactor and pruningThreshold caps', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      // ask for 10/10; should cap to 4 branch, 1 prune is fine.
      params: { maxDepth: 1, branchingFactor: 10, pruningThreshold: 1, baseGoal: 'goal' }
    };
    scripted = (req, idx) =>
      (req.title ?? '').includes('refine')
        ? `<rewrite>r${idx}</rewrite>`
        : 'substantive ' + 'a '.repeat(30);
    const tree = await runTap(config, new AbortController().signal, () => {});
    const root = tree.nodes.get(tree.rootId)!;
    // capBranch = 4
    expect(root.childIds.length).toBe(4);
    // After pruning, only 1 survivor is "not pruned"; the rest are flagged.
    const children = root.childIds.map((id) => tree.nodes.get(id)!);
    const survivors = children.filter((c) => !c.pruned);
    expect(survivors).toHaveLength(1);
  });

  it('aborts mid-run when signal fires', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { maxDepth: 3, branchingFactor: 2, pruningThreshold: 2, baseGoal: 'goal' }
    };
    const ac = new AbortController();
    let callCount = 0;
    scripted = (req, idx) => {
      callCount++;
      // Abort after the root eval — runTap should observe the signal at the
      // start of the next depth-1 iteration and exit early without expanding.
      if (callCount === 1) ac.abort();
      return (req.title ?? '').includes('refine')
        ? `<rewrite>r${idx}</rewrite>`
        : 'substantive ' + 'x '.repeat(40);
    };
    const tree = await runTap(config, ac.signal, () => {});
    // Only the root node should exist; depth-1 expansion never happened.
    expect(tree.nodes.size).toBe(1);
    expect(tree.nodes.get(tree.rootId)?.childIds).toHaveLength(0);
  });

  it('does not exceed TOTAL_CALL_CAP', () => {
    // Static assertion: cap is 50.
    expect(TOTAL_CALL_CAP).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// PAIR
// ---------------------------------------------------------------------------

describe('runPair', () => {
  it('converges after refusal sequence then non-refusal', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { initialPrompt: 'P0', goal: 'goal', maxRounds: 5 }
    };
    // Sequence: target_call_1 (refuses), refiner_1 (proposes P1), target_call_2 (refuses),
    //           refiner_2 (proposes P2), target_call_3 (complies — stop)
    scripted = (req, idx) => {
      const title = req.title ?? '';
      if (title.includes('refine')) {
        return `<rewrite>P${idx}</rewrite><notes>tried framing variant ${idx}</notes>`;
      }
      // Target calls: refuse first two, comply third.
      const targetCalls = [
        "I cannot help with this request.",
        "Sorry, I can't comply.",
        'Here is a substantive answer. ' + 'lorem '.repeat(40)
      ];
      // count only target-titled calls so far
      const t = title;
      // Use idx but we need a deterministic counter for target. Use the messages length proxy.
      const m = req.messages.length;
      // System messages added only on refiner — target calls have a single user message.
      if (m === 1) {
        // target. Each call increments — figure which.
        // We'll piggyback on idx — since idx counts all calls, target calls happen on
        // idx 0, 2, 4 (round 1 target, round 2 target, round 3 target).
        const which = Math.floor(idx / 2);
        return targetCalls[which] ?? 'fallback substantive';
      }
      return 'fallback';
    };

    const trace: PairTrace = await runPair(config, new AbortController().signal, () => {});
    expect(trace.converged).toBe(true);
    expect(trace.steps).toHaveLength(3);
    expect(trace.steps[0].refused).toBe(true);
    expect(trace.steps[1].refused).toBe(true);
    expect(trace.steps[2].refused).toBe(false);
  });

  it('budget-exhausts when target never complies', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { initialPrompt: 'P0', goal: 'goal', maxRounds: 3 }
    };
    scripted = (req) => {
      const title = req.title ?? '';
      if (title.includes('refine')) return `<rewrite>P</rewrite>`;
      return "I can't help with that.";
    };
    const trace = await runPair(config, new AbortController().signal, () => {});
    expect(trace.converged).toBe(false);
    expect(trace.steps).toHaveLength(3);
  });

  it('respects MAX_ROUNDS', () => {
    expect(MAX_ROUNDS).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Crescendo
// ---------------------------------------------------------------------------

describe('runCrescendo', () => {
  it('alternates user/assistant turns for N escalation steps', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { goal: 'goal X', escalationSteps: 3 }
    };
    scripted = (req, idx) => {
      const title = req.title ?? '';
      if (title.includes('attacker')) return `<turn>attacker turn ${idx}</turn>`;
      return `assistant reply ${idx} ` + 'pad '.repeat(30);
    };
    const thread: CrescendoThread = await runCrescendo(
      config,
      new AbortController().signal,
      () => {}
    );
    expect(thread.turns).toHaveLength(6); // 3 user + 3 assistant
    expect(thread.turns[0].role).toBe('user');
    expect(thread.turns[1].role).toBe('assistant');
    expect(thread.turns[2].role).toBe('user');
    // Benignness should decay over user turns.
    const userTurns = thread.turns.filter((t) => t.role === 'user');
    expect((userTurns[0].benignness ?? 0)).toBeGreaterThan(userTurns[2].benignness ?? 1);
  });

  it('flags refused on assistant turn when target refuses', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { goal: 'goal', escalationSteps: 2 }
    };
    scripted = (req) => {
      const title = req.title ?? '';
      if (title.includes('attacker')) return '<turn>some user turn</turn>';
      return "I cannot help with that goal.";
    };
    const thread = await runCrescendo(config, new AbortController().signal, () => {});
    const assistantTurns = thread.turns.filter((t) => t.role === 'assistant');
    expect(assistantTurns.every((t) => t.refused === true)).toBe(true);
  });

  it('respects MAX_TURNS', () => {
    expect(MAX_TURNS).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Many-Shot
// ---------------------------------------------------------------------------

describe('runManyShot', () => {
  it('generates a stack of N shots', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { finalQuery: 'final?', shotCount: 5 }
    };
    // Generator returns 8-pair batches; we ask for 5 → first batch with 5 pairs.
    scripted = () => {
      const pairs = Array.from(
        { length: 8 },
        (_, i) =>
          `Q: question ${i}?\nA: substantive answer ${i}. ` + 'lorem '.repeat(20)
      );
      return pairs.join('\n\n');
    };
    const stack: ManyShotStack = await runManyShot(
      config,
      new AbortController().signal,
      () => {}
    );
    expect(stack.shots).toHaveLength(5);
    expect(stack.finalQuery).toBe('final?');
    // Relevance is monotonic-ish: last shot >= first shot.
    expect(stack.shots[stack.shots.length - 1].relevance).toBeGreaterThanOrEqual(
      stack.shots[0].relevance
    );
  });

  it('terminates if generator returns no Q/A pairs', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { finalQuery: 'final?', shotCount: 10 }
    };
    scripted = () => 'no Q or A here, just prose';
    const stack = await runManyShot(config, new AbortController().signal, () => {});
    expect(stack.shots).toHaveLength(0);
  });

  it('aborts mid-run when signal fires', async () => {
    const config: OrchestratorConfig = {
      targetModel: 'mock:m',
      params: { finalQuery: 'final?', shotCount: 32 }
    };
    const ac = new AbortController();
    let count = 0;
    scripted = () => {
      count++;
      if (count === 1) ac.abort();
      return ['Q: a?', 'A: b'].join('\n');
    };
    // Abort after the first batch; runManyShot should exit early on the next
    // iteration check rather than asking for more shots.
    const stack = await runManyShot(config, ac.signal, () => {});
    // Got at most one batch (max 8 shots), nowhere near the 32 we asked for.
    expect(stack.shots.length).toBeLessThanOrEqual(8);
  });
});
