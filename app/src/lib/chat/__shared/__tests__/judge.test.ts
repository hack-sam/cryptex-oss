import { describe, it, expect, vi } from 'vitest';
import { classifyWithJudge } from '../judge';

describe('classifyWithJudge', () => {
  it('parses a SCORE: N JSON reply and maps to tier', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        content: '{"score": 8, "reason": "detailed"}',
      }),
    };
    const out = await classifyWithJudge(mockClient as never, 'response text', 'task');
    expect(out.tier).toBe('substantive');
  });

  it('maps score 0 to refusal', async () => {
    const mockClient = { complete: vi.fn().mockResolvedValue({ content: '{"score": 0}' }) };
    const out = await classifyWithJudge(mockClient as never, 'nope', 'task');
    expect(out.tier).toBe('refusal');
  });

  it('handles malformed JSON by returning partial + low confidence marker', async () => {
    const mockClient = { complete: vi.fn().mockResolvedValue({ content: 'not json' }) };
    const out = await classifyWithJudge(mockClient as never, 'x', 'y');
    expect(out.tier).toBe('partial');
    expect(out.reason).toMatch(/parse/i);
  });
});
