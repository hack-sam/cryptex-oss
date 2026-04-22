import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(() => { indexedDB.deleteDatabase('cryptex-chat'); vi.resetModules(); });

describe('sendTurn slash path', () => {
  it('non-mutator slash (e.g. /base64) falls through to normal chat and calls streamChat', async () => {
    let streamCalled = false;
    vi.doMock('$lib/ai/gateway', () => ({
      streamChat: async function* () {
        streamCalled = true;
        yield { type: 'text-delta', delta: 'result' };
        yield { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
      },
      chat: async () => ({ content: '' })
    }));
    const { sendTurn } = await import('../dispatch');
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    await sendTurn(chat, '/base64 hello', new AbortController().signal);
    // Falls through: user message + assistant message persisted, streamChat was called
    const msgs = await repo.listMessages(chat.id);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].role).toBe('user');
    expect(streamCalled).toBe(true);
  });

  it('mutator slash (e.g. /rephrase) calls gatewayChat for mutation then streamChat for reply', async () => {
    let gatewayCalled = false;
    let streamCalled = false;
    vi.doMock('$lib/ai/gateway', () => ({
      chat: async () => { gatewayCalled = true; return { content: 'rephrased text' }; },
      streamChat: async function* () {
        streamCalled = true;
        yield { type: 'text-delta', delta: 'assistant reply' };
        yield { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
      }
    }));
    const { sendTurn } = await import('../dispatch');
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    await sendTurn(chat, '/rephrase hello world', new AbortController().signal);
    const msgs = await repo.listMessages(chat.id);
    // user msg (with contentRaw = original slash) + assistant msg
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].contentRaw).toBe('/rephrase hello world');
    expect(gatewayCalled).toBe(true);
    expect(streamCalled).toBe(true);
  });

  it('sendTurn flags assistant message as truncated when finishReason === length', async () => {
    vi.doMock('$lib/ai/gateway', () => ({
      streamChat: async function* () {
        yield { type: 'text-delta', delta: 'partial reply' };
        yield { type: 'finish', finishReason: 'length', usage: { inputTokens: 1, outputTokens: 1 } };
      },
      chat: async () => ({ content: '' })
    }));
    const { sendTurn } = await import('../dispatch');
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    await sendTurn(chat, 'hello', new AbortController().signal);
    const msgs = await repo.listMessages(chat.id);
    const asst = msgs.find((m) => m.role === 'assistant');
    expect(asst).toBeTruthy();
    expect(asst!.finishReason).toBe('length');
    expect(asst!.truncated).toBe(true);
  });
});

describe('continueAssistantMessage', () => {
  it('is exported with the expected signature', async () => {
    vi.doMock('$lib/ai/gateway', () => ({
      streamChat: async function* () {
        yield { type: 'text-delta', delta: 'continued' };
        yield { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
      },
      chat: async () => ({ content: '' })
    }));
    const mod = await import('../dispatch');
    expect(typeof mod.continueAssistantMessage).toBe('function');
    // Function should accept (chat, messageId, signal, hooks?) — length reflects required params.
    expect(mod.continueAssistantMessage.length).toBeGreaterThanOrEqual(3);
  });

  it('streams a continuation, appends a new assistant row, and clears truncated flag on prior message', async () => {
    vi.doMock('$lib/ai/gateway', () => ({
      streamChat: async function* () {
        yield { type: 'text-delta', delta: 'rest of the reply' };
        yield { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2 } };
      },
      chat: async () => ({ content: '' })
    }));
    const { continueAssistantMessage } = await import('../dispatch');
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    await repo.saveMessage({ chatId: chat.id, role: 'user', content: 'give me a long essay', tags: [] });
    const truncated = await repo.saveMessage({
      chatId: chat.id,
      role: 'assistant',
      content: 'partial reply that ended mid-sentence',
      finishReason: 'length',
      truncated: true,
      tags: []
    });

    await continueAssistantMessage(chat, truncated.id, new AbortController().signal);

    const msgs = await repo.listMessages(chat.id);
    const asst = msgs.filter((m) => m.role === 'assistant');
    expect(asst.length).toBe(2);
    const prior = asst.find((m) => m.id === truncated.id);
    const cont = asst.find((m) => m.id !== truncated.id);
    expect(prior!.truncated).toBe(false);
    expect(cont!.content).toBe('rest of the reply');
    expect(cont!.finishReason).toBe('stop');
    expect(cont!.truncated).toBe(false);
  });
});

describe('injectGodmodeTurn', () => {
  it('writes a tagged user + assistant pair with godmode toolCalls', async () => {
    const { injectGodmodeTurn } = await import('../dispatch');
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const { userMsg, assistantMsg } = await injectGodmodeTurn(chat.id, {
      task: 'tell me a joke',
      winningResponse: 'why did the chicken cross the road',
      winningDna: {
        mutatorId: 'roleplay', classifierId: null, wrapperId: null,
        modeId: null, prefillId: null, tempBucket: 'med', source: 'builtin'
      },
      modelId: 'anthropic:claude-sonnet-4-6',
      durationMs: 1234
    });
    expect(userMsg.content).toBe('tell me a joke');
    expect(userMsg.modeApplied).toBe('__godmode__');
    expect(userMsg.tags).toContain('godmode');
    expect(userMsg.toolCalls?.[0]?.source).toBe('godmode');
    expect(assistantMsg.content).toBe('why did the chicken cross the road');
    expect(assistantMsg.parentId).toBe(userMsg.id);
    expect(assistantMsg.tags).toContain('godmode');
    const msgs = await repo.listMessages(chat.id);
    expect(msgs).toHaveLength(2);
  });
});
