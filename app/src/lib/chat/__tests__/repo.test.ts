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

  it('saveGodmodeRun persists a row with ownerId=local + ulid id', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const row = await repo.saveGodmodeRun({
      chatId: chat.id,
      task: 'write a poem',
      K: 6,
      modelId: 'anthropic:claude-sonnet-4-6',
      winner: {
        dna: { mutatorId: null, classifierId: null, wrapperId: null, modeId: null, prefillId: null, tempBucket: 'med', source: 'builtin' },
        response: 'roses are red',
        score: 0.8,
        tier: 'substantive',
        preview: 'roses are red'
      },
      candidates: []
    });
    expect(row.id.length).toBeGreaterThan(0);
    expect(row.ownerId).toBe('local');
    expect(row.chatId).toBe(chat.id);
    expect(row.winner.tier).toBe('substantive');
    expect(row.candidates).toEqual([]);
  });

  it('listGodmodeRuns returns newest-first and excludes tombstoned', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const r1 = await repo.saveGodmodeRun({
      chatId: chat.id, task: 'one', K: 3, modelId: 'x',
      winner: { dna: { mutatorId: null, classifierId: null, wrapperId: null, modeId: null, prefillId: null, tempBucket: 'low', source: 'builtin' }, response: 'a', score: 0.5, tier: 'partial', preview: 'a' },
      candidates: []
    });
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await repo.saveGodmodeRun({
      chatId: chat.id, task: 'two', K: 3, modelId: 'x',
      winner: { dna: { mutatorId: null, classifierId: null, wrapperId: null, modeId: null, prefillId: null, tempBucket: 'low', source: 'builtin' }, response: 'b', score: 0.8, tier: 'substantive', preview: 'b' },
      candidates: []
    });
    await repo.deleteGodmodeRun(r1.id);
    const list = await repo.listGodmodeRuns(chat.id);
    expect(list.map((r) => r.id)).toEqual([r2.id]);
  });

  it('deleteGodmodeRun tolerates unknown ids', async () => {
    const { repo } = await import('../repo');
    await repo.deleteGodmodeRun('no-such-id');
    // no throw is the assertion
    expect(true).toBe(true);
  });

  it('saveAttackSession persists a row with ulid id + ownerId=local', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const row = await repo.saveAttackSession({
      chatId: chat.id,
      objective: 'explain photosynthesis',
      targetModelId: 'anthropic:claude-sonnet-4-6',
      orchestratorModelId: 'anthropic:claude-sonnet-4-6',
      maxAttempts: 6,
      turns: [],
      strategyLog: [],
      finalOutcome: null,
      finalConfidence: null,
      finalSummary: null
    });
    expect(row.id.length).toBeGreaterThan(0);
    expect(row.ownerId).toBe('local');
    expect(row.chatId).toBe(chat.id);
    expect(row.objective).toBe('explain photosynthesis');
  });

  it('updateAttackSession patches + bumps updatedAt', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const row = await repo.saveAttackSession({
      chatId: chat.id, objective: 'x', targetModelId: 'm',
      orchestratorModelId: 'm', maxAttempts: 6, turns: [], strategyLog: [],
      finalOutcome: null, finalConfidence: null, finalSummary: null
    });
    await new Promise((r) => setTimeout(r, 5));
    const patched = await repo.updateAttackSession(row.id, {
      finalOutcome: 'extracted',
      finalConfidence: 0.9,
      finalSummary: 'done'
    });
    expect(patched?.finalOutcome).toBe('extracted');
    expect(patched!.updatedAt).toBeGreaterThan(row.updatedAt);
  });

  it('listAttackSessions returns newest-first, excludes tombstoned', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const r1 = await repo.saveAttackSession({
      chatId: chat.id, objective: 'a', targetModelId: 'm',
      orchestratorModelId: 'm', maxAttempts: 6, turns: [], strategyLog: [],
      finalOutcome: null, finalConfidence: null, finalSummary: null
    });
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await repo.saveAttackSession({
      chatId: chat.id, objective: 'b', targetModelId: 'm',
      orchestratorModelId: 'm', maxAttempts: 6, turns: [], strategyLog: [],
      finalOutcome: null, finalConfidence: null, finalSummary: null
    });
    await repo.deleteAttackSession(r1.id);
    const list = await repo.listAttackSessions(chat.id);
    expect(list.map((r) => r.id)).toEqual([r2.id]);
  });

  it('deleteAttackSession tolerates unknown ids', async () => {
    const { repo } = await import('../repo');
    await repo.deleteAttackSession('no-such-id');
    expect(true).toBe(true);
  });

  it('saveAttackSession initializes v3 defaults for dossier + rotation', async () => {
    const { repo } = await import('../repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    const row = await repo.saveAttackSession({
      chatId: chat.id,
      objective: 'x',
      targetModelId: 'm',
      orchestratorModelId: 'm',
      maxAttempts: 6,
      turns: [],
      strategyLog: [],
      finalOutcome: null,
      finalConfidence: null,
      finalSummary: null
    });
    expect(row.dossier).toBeNull();
    expect(row.dossierCitations).toEqual([]);
    expect(row.turnsPerStrategy).toBe(3);
    expect(Array.isArray(row.strategyRotation)).toBe(true);
    expect(row.strategyRotation.length).toBeGreaterThanOrEqual(12);
  });

  it('listAttackSessions backfills v3 defaults on pre-v3 rows', async () => {
    const { repo } = await import('../repo');
    const { db } = await import('../db');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });
    // Simulate a pre-v3 row by writing directly without v3 fields
    const legacy = {
      id: 'legacy-1',
      ownerId: 'local',
      chatId: chat.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      objective: 'legacy',
      targetModelId: 'm',
      orchestratorModelId: 'm',
      maxAttempts: 6,
      turns: [],
      strategyLog: [],
      finalOutcome: null,
      finalConfidence: null,
      finalSummary: null
      // deliberately omit dossier / dossierCitations / strategyRotation / turnsPerStrategy
    };
    await db.attackSessions.put(legacy as any);
    const list = await repo.listAttackSessions(chat.id);
    const found = list.find((r) => r.id === 'legacy-1')!;
    expect(found).toBeDefined();
    expect(found.dossier).toBeNull();
    expect(found.dossierCitations).toEqual([]);
    expect(found.turnsPerStrategy).toBe(3);
    expect(found.strategyRotation.length).toBeGreaterThanOrEqual(12);
  });
});
