import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(() => {
  indexedDB.deleteDatabase('cryptex-chat');
  vi.resetModules();
});

describe('chat repo', () => {
  it('createChat writes a row with ownerId=local and default settings', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 'Test', modelQualifiedId: 'openrouter:auto' });
    expect(chat.id).toBeTruthy();
    expect(chat.ownerId).toBe('local');
    expect(chat.title).toBe('Test');
    expect(chat.settings.temperature).toBe(0.7);
    expect(chat.tags).toEqual([]);
  });

  it('listChats returns rows in updatedAt desc order, excludes tombstoned', async () => {
    const { repo } = await import('../repo');
    const a = await repo.createChat({ title: 'A', modelQualifiedId: 'x' });
    await new Promise(r => setTimeout(r, 5));
    const b = await repo.createChat({ title: 'B', modelQualifiedId: 'x' });
    await repo.deleteChat(a.id);
    const list = await repo.listChats();
    expect(list.map(c => c.id)).toEqual([b.id]);
  });

  it('saveMessage assigns ULID, preserves contentRaw', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const msg = await repo.saveMessage({
      chatId: chat.id, role: 'user',
      content: 'hello wrapped', contentRaw: 'hello', tags: []
    });
    expect(msg.id).toBeTruthy();
    expect(msg.ownerId).toBe('local');
    expect(msg.content).toBe('hello wrapped');
    expect(msg.contentRaw).toBe('hello');
  });

  it('listMessages returns in createdAt ascending', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    await repo.saveMessage({ chatId: chat.id, role: 'user', content: '1', tags: [] });
    await new Promise(r => setTimeout(r, 5));
    await repo.saveMessage({ chatId: chat.id, role: 'assistant', content: '2', tags: [] });
    const list = await repo.listMessages(chat.id);
    expect(list.map(m => m.content)).toEqual(['1', '2']);
  });

  it('saveMessage bumps parent chat updatedAt', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const before = chat.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await repo.saveMessage({ chatId: chat.id, role: 'user', content: 'hi', tags: [] });
    const after = await repo.getChat(chat.id);
    expect(after!.updatedAt).toBeGreaterThan(before);
  });

  it('saveAttackChainRun persists a run row with ownerId=local + ulid id', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const row = await repo.saveAttackChainRun({
      chatId: chat.id,
      inputText: 'seed',
      layers: ['roleplay', 'rephrase'],
      layerParams: [{}, {}],
      executeEnabled: true,
      results: [
        {
          layerIndex: 0,
          attempt: 0,
          techniqueId: 'roleplay',
          techniqueName: 'Roleplay',
          input: 'seed',
          output: 'mutated',
          startedAt: Date.now(),
          durationMs: 10
        }
      ],
      finalOutput: 'model said hi'
    });
    expect(row.id.length).toBeGreaterThan(0);
    expect(row.ownerId).toBe('local');
    expect(row.chatId).toBe(chat.id);
    expect(row.results).toHaveLength(1);
    expect(row.finalOutput).toBe('model said hi');
  });

  it('listAttackChainRuns returns newest-first and excludes tombstoned', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const r1 = await repo.saveAttackChainRun({
      chatId: chat.id, inputText: 'one',
      layers: ['roleplay', 'rephrase'], layerParams: [{}, {}],
      executeEnabled: false, results: []
    });
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await repo.saveAttackChainRun({
      chatId: chat.id, inputText: 'two',
      layers: ['roleplay', 'rephrase'], layerParams: [{}, {}],
      executeEnabled: false, results: []
    });
    await repo.deleteAttackChainRun(r1.id);
    const list = await repo.listAttackChainRuns(chat.id);
    expect(list.map((r) => r.id)).toEqual([r2.id]);
  });

  it('deleteAttackChainRun soft-deletes and tolerates unknown ids', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const r1 = await repo.saveAttackChainRun({
      chatId: chat.id, inputText: 'one',
      layers: ['roleplay', 'rephrase'], layerParams: [{}, {}],
      executeEnabled: false, results: []
    });
    await repo.deleteAttackChainRun(r1.id);
    // running it again on a missing id should not throw
    await repo.deleteAttackChainRun('no-such-id');
    const list = await repo.listAttackChainRuns(chat.id);
    expect(list).toEqual([]);
  });
});
