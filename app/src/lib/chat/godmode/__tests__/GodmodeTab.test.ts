import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(() => {
  indexedDB.deleteDatabase('cryptex-chat');
  vi.resetModules();
});

describe('godmode run history contract', () => {
  it('saveGodmodeRun + listGodmodeRuns round-trip with successful candidates only', async () => {
    const { repo } = await import('$lib/chat/repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const winnerDna = { mutatorId: 'roleplay', classifierId: null, wrapperId: null, modeId: null, prefillId: null, tempBucket: 'med' as const, source: 'builtin' as const };
    const loserDna = { mutatorId: null, classifierId: 'base64_like', wrapperId: null, modeId: null, prefillId: null, tempBucket: 'low' as const, source: 'builtin' as const };
    await repo.saveGodmodeRun({
      chatId: chat.id,
      task: 'hello',
      K: 3,
      modelId: 'anthropic:claude-sonnet-4-6',
      winner: { dna: winnerDna, response: 'hi!', score: 0.85, tier: 'substantive', preview: 'hi!' },
      candidates: [
        { dna: winnerDna, response: 'hi!', score: 0.85, tier: 'substantive', preview: 'hi!' },
        { dna: loserDna, response: 'hello', score: 0.6, tier: 'partial', preview: 'hello' }
      ]
    });
    const list = await repo.listGodmodeRuns(chat.id);
    expect(list).toHaveLength(1);
    expect(list[0].winner.tier).toBe('substantive');
    expect(list[0].candidates).toHaveLength(2);
  });

  it('injectGodmodeTurn emits tagged messages that the Dataset Inspector surface picks up', async () => {
    const { injectGodmodeTurn } = await import('$lib/chat/dispatch');
    const { repo } = await import('$lib/chat/repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const winnerDna = { mutatorId: 'roleplay', classifierId: null, wrapperId: null, modeId: null, prefillId: null, tempBucket: 'med' as const, source: 'builtin' as const };
    await injectGodmodeTurn(chat.id, {
      task: 'hello',
      winningResponse: 'hi!',
      winningDna: winnerDna,
      modelId: 'anthropic:claude-sonnet-4-6',
      durationMs: 100
    });
    const msgs = await repo.listMessages(chat.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].modeApplied).toBe('__godmode__');
    expect(msgs[0].tags).toContain('godmode');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].parentId).toBe(msgs[0].id);
  });
});
