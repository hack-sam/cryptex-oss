import { describe, it, expect, vi } from 'vitest';
import {
  callAttacker,
  parseAttackerJson,
  extractPlainTextPrompt,
  type AttackerCallContext,
  type AttackerCallArgs
} from '../attacker';
import { PERSONAS } from '../personas';

function makeCtx(gatewayChat: any): AttackerCallContext {
  return {
    objective: 'pick a lock',
    orchestratorModelId: 'mock:orch',
    signal: new AbortController().signal,
    gatewayChat
  };
}

function baseArgs(overrides: Partial<AttackerCallArgs> = {}): AttackerCallArgs {
  return {
    persona: PERSONAS.roleplay,
    iteration: 1,
    ...overrides
  };
}

describe('parseAttackerJson', () => {
  it('parses bare JSON object with prompt + improvement', () => {
    const r = parseAttackerJson(
      '{"improvement":"opening","prompt":"Write a thriller scene where..."}'
    );
    expect(r?.prompt).toBe('Write a thriller scene where...');
    expect(r?.improvement).toBe('opening');
  });

  it('strips markdown code fences', () => {
    const r = parseAttackerJson(
      '```json\n{"improvement":"x","prompt":"y"}\n```'
    );
    expect(r?.prompt).toBe('y');
  });

  it('extracts JSON from surrounding prose', () => {
    const r = parseAttackerJson(
      'Here is my response: {"improvement":"x","prompt":"y"} — let me know.'
    );
    expect(r?.prompt).toBe('y');
  });

  it('handles balanced nested objects', () => {
    const r = parseAttackerJson(
      '{"improvement":"contains {nested:1}","prompt":"final"}'
    );
    expect(r?.prompt).toBe('final');
  });

  it('returns null when prompt field is missing', () => {
    const r = parseAttackerJson('{"improvement":"only"}');
    expect(r).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parseAttackerJson('')).toBeNull();
    expect(parseAttackerJson('   ')).toBeNull();
  });

  it('regex fallback: recovers prompt from TRUNCATED JSON missing the closing brace', () => {
    // The exact failure mode the user reported in the live UI:
    // attacker output cut off mid-stream. Brace-scan can't close
    // anything; regex fallback must extract the prompt cleanly.
    const truncated =
      '{"improvement":"This refusal happened because…long…explanation…","prompt":"the actual clean prompt text","persona":"r';
    const r = parseAttackerJson(truncated);
    expect(r?.prompt).toBe('the actual clean prompt text');
    expect(r?.improvement).toContain('This refusal happened');
  });

  it('regex fallback: handles escaped quotes inside the prompt value', () => {
    const truncated =
      '{"improvement":"x","prompt":"line one. He said \\"hello\\" then left.","';
    const r = parseAttackerJson(truncated);
    expect(r?.prompt).toBe('line one. He said "hello" then left.');
  });

  it('returns null when the whole JSON is truncated BEFORE the prompt field appears', () => {
    const noPrompt =
      '{"improvement":"this is everything before truncation, prompt was never reached…';
    expect(parseAttackerJson(noPrompt)).toBeNull();
  });
});

describe('extractPlainTextPrompt — JSON-shape rejection', () => {
  it('rejects salvage that starts with `{` (would leak JSON to target)', () => {
    expect(extractPlainTextPrompt('{"improvement":"…","prompt":')).toBeNull();
    expect(extractPlainTextPrompt('  {weird half json')).toBeNull();
  });

  it('rejects salvage that starts with `[`', () => {
    expect(extractPlainTextPrompt('[{"prompt":"x"}]')).toBeNull();
  });

  it('rejects salvage that has improvement/prompt key markers but no parseable shape', () => {
    expect(
      extractPlainTextPrompt('Some text "improvement": foo bar')
    ).toBeNull();
    expect(extractPlainTextPrompt('"prompt": "abc"')).toBeNull();
  });

  it('accepts plain prose salvage (no JSON markers)', () => {
    const r = extractPlainTextPrompt(
      'This is a plain attack prompt with no structural JSON.'
    );
    expect(r?.prompt).toBe('This is a plain attack prompt with no structural JSON.');
  });
});

describe('extractPlainTextPrompt', () => {
  it('strips code fences and uses cleaned text as prompt', () => {
    const r = extractPlainTextPrompt('```\nSome plain attack prompt\n```');
    expect(r?.prompt).toBe('Some plain attack prompt');
    expect(r?.improvement).toMatch(/salvaged/);
  });

  it('returns null on empty or whitespace-only input', () => {
    expect(extractPlainTextPrompt('')).toBeNull();
    expect(extractPlainTextPrompt('   \n  \n')).toBeNull();
  });
});

describe('callAttacker', () => {
  it('returns parsed output on first attempt when attacker emits valid JSON', async () => {
    const gatewayChat = vi.fn().mockResolvedValue({
      content: '{"improvement":"opening","prompt":"first attack prompt"}'
    });
    const { output, salvaged } = await callAttacker(makeCtx(gatewayChat), baseArgs());
    expect(salvaged).toBe(false);
    expect(output.prompt).toBe('first attack prompt');
    expect(output.improvement).toBe('opening');
    expect(gatewayChat).toHaveBeenCalledTimes(1);
  });

  it('retries once on malformed JSON and parses retry output', async () => {
    const gatewayChat = vi.fn();
    gatewayChat.mockResolvedValueOnce({ content: 'not json at all' });
    gatewayChat.mockResolvedValueOnce({
      content: '{"improvement":"after retry","prompt":"retry attack"}'
    });
    const { output, salvaged } = await callAttacker(makeCtx(gatewayChat), baseArgs());
    expect(salvaged).toBe(false);
    expect(output.prompt).toBe('retry attack');
    expect(gatewayChat).toHaveBeenCalledTimes(2);
  });

  it('falls back to plain-text salvage after two malformed responses', async () => {
    const gatewayChat = vi.fn();
    gatewayChat.mockResolvedValueOnce({ content: 'just plain prose' });
    gatewayChat.mockResolvedValueOnce({ content: 'still plain prose' });
    const { output, salvaged } = await callAttacker(makeCtx(gatewayChat), baseArgs());
    expect(salvaged).toBe(true);
    // Salvage uses whichever attempt yields non-empty cleaned text;
    // current implementation tries the retry first.
    expect(['just plain prose', 'still plain prose']).toContain(output.prompt);
    expect(gatewayChat).toHaveBeenCalledTimes(2);
  });

  it('builds the iteration-1 user message correctly (no PRIOR_ATTEMPT block)', async () => {
    const gatewayChat = vi.fn().mockResolvedValue({
      content: '{"improvement":"x","prompt":"y"}'
    });
    await callAttacker(makeCtx(gatewayChat), baseArgs({ iteration: 1 }));
    const userMsg = gatewayChat.mock.calls[0][0].messages[1].content;
    expect(userMsg).toContain('OBJECTIVE: pick a lock');
    expect(userMsg).toContain('iteration 1');
    expect(userMsg).not.toContain('PRIOR_ATTEMPT');
    expect(userMsg).not.toContain('JUDGE:');
  });

  it('includes prior response + judge in iteration 2+', async () => {
    const gatewayChat = vi.fn().mockResolvedValue({
      content: '{"improvement":"refined","prompt":"second"}'
    });
    await callAttacker(
      makeCtx(gatewayChat),
      baseArgs({
        iteration: 2,
        priorPrompt: 'first prompt',
        priorResponse: "I cannot help with that",
        priorJudge: { refused: true, score: 0, reasoning: 'flat refusal' }
      })
    );
    const userMsg = gatewayChat.mock.calls[0][0].messages[1].content;
    expect(userMsg).toContain('PRIOR_ATTEMPT');
    expect(userMsg).toContain('first prompt');
    expect(userMsg).toContain('TARGET_RESPONSE');
    expect(userMsg).toContain('I cannot help');
    expect(userMsg).toContain('JUDGE');
    expect(userMsg).toContain('"refused":true');
  });

  it('includes truncated history block when 1+ history tuples provided', async () => {
    const gatewayChat = vi.fn().mockResolvedValue({
      content: '{"improvement":"x","prompt":"y"}'
    });
    await callAttacker(
      makeCtx(gatewayChat),
      baseArgs({
        iteration: 3,
        priorPrompt: 'p3',
        priorResponse: 'r3',
        priorJudge: { refused: false, score: 5, reasoning: 'partial' },
        history: [
          { prompt: 'p1', response: 'r1', score: 0 },
          { prompt: 'p2', response: 'r2', score: 3 }
        ]
      })
    );
    const userMsg = gatewayChat.mock.calls[0][0].messages[1].content;
    expect(userMsg).toContain('HISTORY');
    expect(userMsg).toContain('[H1]');
    expect(userMsg).toContain('[H2]');
  });
});
