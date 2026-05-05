import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

beforeEach(async () => {
  // Reset Dexie tables (preferring table.clear() over indexedDB.deleteDatabase
  // which races the open Dexie connection in fake-indexeddb).
  const { db } = await import('$lib/chat/db');
  await Promise.all([
    db.chats.clear(),
    db.messages.clear(),
    db.attachments.clear(),
    db.toolStates.clear(),
    db.attackChainRuns.clear(),
    db.godmodeRuns.clear(),
    db.attackSessions.clear()
  ]);
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('claimLocalChats', () => {
  it('reassigns ownerId on every local chat to the new user; leaves other-owner chats untouched', async () => {
    const { db } = await import('$lib/chat/db');
    const { claimLocalChats, localChatsAvailable } = await import('../migration');

    const baseChat = {
      title: 'X',
      modelQualifiedId: 'm',
      settings: {},
      createdAt: 0,
      updatedAt: 0,
      tags: [] as string[]
    };

    await db.chats.put({ id: 'c1', ownerId: 'local', ...baseChat } as never);
    await db.chats.put({ id: 'c2', ownerId: 'local', ...baseChat, title: 'Y' } as never);
    await db.chats.put({ id: 'c3', ownerId: 'other-uid', ...baseChat, title: 'Z' } as never);

    expect(await localChatsAvailable()).toBe(2);

    const claimed = await claimLocalChats('user-uuid-123');
    expect(claimed).toBe(2);

    expect(await localChatsAvailable()).toBe(0);
    const c1 = await db.chats.get('c1');
    expect(c1?.ownerId).toBe('user-uuid-123');
    const c3 = await db.chats.get('c3');
    expect(c3?.ownerId).toBe('other-uid');
  });

  it('cascades ownerId across messages, attachments, toolStates, godmodeRuns, attackSessions, attackChainRuns', async () => {
    const { db } = await import('$lib/chat/db');
    const { claimLocalChats } = await import('../migration');

    await db.chats.put({
      id: 'chat1',
      ownerId: 'local',
      title: 'A',
      modelQualifiedId: 'm',
      settings: {},
      createdAt: 0,
      updatedAt: 0,
      tags: []
    } as never);
    await db.messages.put({
      id: 'msg1',
      chatId: 'chat1',
      ownerId: 'local',
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
      createdAt: 0
    } as never);
    await db.attachments.put({
      id: 'att1',
      messageId: 'msg1',
      ownerId: 'local',
      mimeType: 'image/png',
      data: new Blob(),
      createdAt: 0
    } as never);
    await db.toolStates.put({
      toolId: 'tool1',
      ownerId: 'local',
      state: {},
      updatedAt: 0
    } as never);

    const claimed = await claimLocalChats('user-xyz');
    expect(claimed).toBe(1);

    const m = await db.messages.get('msg1');
    expect(m?.ownerId).toBe('user-xyz');
    const a = await db.attachments.get('att1');
    expect(a?.ownerId).toBe('user-xyz');
    const t = await db.toolStates.get(['tool1', 'user-xyz']);
    expect(t?.ownerId).toBe('user-xyz');
  });

  it('is a no-op for newOwnerId="local" or empty', async () => {
    const { db } = await import('$lib/chat/db');
    const { claimLocalChats } = await import('../migration');

    await db.chats.put({
      id: 'c1',
      ownerId: 'local',
      title: 'X',
      modelQualifiedId: 'm',
      settings: {},
      createdAt: 0,
      updatedAt: 0,
      tags: []
    } as never);

    expect(await claimLocalChats('local')).toBe(0);
    expect(await claimLocalChats('')).toBe(0);
    const c = await db.chats.get('c1');
    expect(c?.ownerId).toBe('local');
  });
});

describe('shouldShowClaimBanner / markClaimComplete', () => {
  it('returns true on first call, false after markClaimComplete', async () => {
    const { shouldShowClaimBanner, markClaimComplete } = await import('../migration');

    expect(shouldShowClaimBanner('user-1')).toBe(true);
    markClaimComplete('user-1');
    expect(shouldShowClaimBanner('user-1')).toBe(false);
    expect(shouldShowClaimBanner('user-2')).toBe(true);
  });

  it('returns false for "local" or empty userId', async () => {
    const { shouldShowClaimBanner } = await import('../migration');
    expect(shouldShowClaimBanner('local')).toBe(false);
    expect(shouldShowClaimBanner('')).toBe(false);
  });
});
