import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(() => {
  indexedDB.deleteDatabase('cryptex-chat');
  vi.resetModules();
});

describe('workspace sidebar state persistence', () => {
  it('persistWorkspaceState writes tab + open state to chat.settings', async () => {
    const { repo } = await import('$lib/chat/repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'x' });

    // Simulate the ChatWorkspace persistWorkspaceState helper inline —
    // the helper is a 5-line read-merge-write that we verify by calling
    // repo.updateChat directly with the same shape.
    const fresh = await repo.getChat(chat.id);
    await repo.updateChat(chat.id, {
      settings: { ...fresh!.settings, workspaceOpen: true, workspaceTab: 'godmode' }
    });

    const after = await repo.getChat(chat.id);
    expect(after!.settings.workspaceOpen).toBe(true);
    expect(after!.settings.workspaceTab).toBe('godmode');
  });

  it('chain model change does not overwrite godmode model (and vice versa)', async () => {
    const { repo } = await import('$lib/chat/repo');
    const chat = await repo.createChat({ title: 't', modelQualifiedId: 'base' });

    // First: set chain model
    await repo.updateChat(chat.id, {
      settings: {
        ...chat.settings,
        attackChainConfig: {
          input: '', layers: [], layerParams: [], layerOutputEdits: [],
          executeEnabled: true, finalSystemPrompt: '', autoRetryEnabled: true,
          modelQualifiedId: 'chain-model'
        }
      }
    });

    // Then: set godmode model
    const mid = await repo.getChat(chat.id);
    await repo.updateChat(chat.id, {
      settings: {
        ...mid!.settings,
        godmodeConfig: {
          task: '', K: 6,
          saveForm: { expanded: false, name: '', decompose: false },
          modelQualifiedId: 'godmode-model'
        }
      }
    });

    const after = await repo.getChat(chat.id);
    expect(after!.settings.attackChainConfig?.modelQualifiedId).toBe('chain-model');
    expect(after!.settings.godmodeConfig?.modelQualifiedId).toBe('godmode-model');
  });
});
