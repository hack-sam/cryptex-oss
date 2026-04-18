import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from '../gateway';

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('resolve', () => {
  it('qualified openrouter:X splits correctly', () => {
    const { adapter, modelId } = resolve('openrouter:openai/gpt-5.4');
    expect(adapter.id).toBe('openrouter');
    expect(modelId).toBe('openai/gpt-5.4');
  });

  it('unqualified id falls back to default openrouter', () => {
    const { adapter, modelId } = resolve('openai/gpt-5.4');
    expect(adapter.id).toBe('openrouter');
    expect(modelId).toBe('openai/gpt-5.4');
  });
});

describe('chatWithRetry', () => {
  it('retries 3x on rate_limit with exponential backoff then gives up', async () => {
    vi.useFakeTimers();
    const err = Object.assign(new Error('429'), { status: 429 });
    const generateText = vi.fn().mockRejectedValue(err);
    // Mock 'ai' BEFORE importing gateway so the dynamic import picks up the mock
    vi.doMock('ai', () => ({ generateText, streamText: vi.fn() }));
    vi.resetModules();
    const { chat } = await import('../gateway');
    // Attach catch before awaiting timers to suppress unhandled rejection
    const p = chat({ model: 'openrouter:x/y', messages: [{ role: 'user', content: 'hi' }] });
    p.catch(() => { /* handled below */ });
    await vi.runAllTimersAsync();
    await expect(p).rejects.toMatchObject({ category: 'rate_limit' });
    expect(generateText.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('retries 3x on 504 then rethrows with server_unavailable', async () => {
    vi.useFakeTimers();
    const err = Object.assign(new Error('504'), { status: 504 });
    const generateText = vi.fn().mockRejectedValue(err);
    vi.doMock('ai', () => ({ generateText, streamText: vi.fn() }));
    vi.resetModules();
    const { chat } = await import('../gateway');
    const p = chat({ model: 'openrouter:x/y', messages: [{ role: 'user', content: 'hi' }] });
    p.catch(() => { /* handled below */ });
    await vi.runAllTimersAsync();
    await expect(p).rejects.toMatchObject({ category: 'server_unavailable' });
    expect(generateText.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
