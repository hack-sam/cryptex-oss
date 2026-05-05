/**
 * Local-chat migration. When a user signs in for the first time after using
 * Cryptex in local-only mode (ownerId = 'local'), we offer to claim those
 * existing chats — bulk-update ownerId from 'local' to the new Supabase user
 * UUID across every related Dexie row in one atomic transaction.
 *
 * Tables touched: chats, messages, attachments, toolStates, attackChainRuns,
 * godmodeRuns, attackSessions. (Same seven tables that carry an ownerId
 * column per the Auth-Readiness Seams design.)
 */
import { db } from '$lib/chat/db';

/** Count of chats currently owned by 'local' (excluding tombstoned ones).
 *  Used to decide whether to surface the claim banner at all. */
export async function localChatsAvailable(): Promise<number> {
  const all = await db.chats.where('ownerId').equals('local').toArray();
  return all.filter((c) => !c.tombstoned).length;
}

/** Claim every row currently owned by 'local' for the given new owner.
 *  Runs as one atomic Dexie transaction across all seven owner-bearing
 *  tables. Returns the number of chat rows reassigned (descendant counts
 *  not surfaced — the chat-level count is what the banner needs to show).
 *  No-op if newOwnerId is 'local' or empty. */
export async function claimLocalChats(newOwnerId: string): Promise<number> {
  if (!newOwnerId || newOwnerId === 'local') return 0;

  let chatCount = 0;
  await db.transaction(
    'rw',
    [
      db.chats,
      db.messages,
      db.attachments,
      db.toolStates,
      db.attackChainRuns,
      db.godmodeRuns,
      db.attackSessions
    ],
    async () => {
      const now = Date.now();
      const chats = await db.chats.where('ownerId').equals('local').toArray();
      for (const c of chats) {
        await db.chats.put({ ...c, ownerId: newOwnerId, updatedAt: now });
        chatCount++;
      }

      const msgs = await db.messages.where('ownerId').equals('local').toArray();
      for (const m of msgs) {
        await db.messages.put({ ...m, ownerId: newOwnerId });
      }

      const atts = await db.attachments.where('ownerId').equals('local').toArray();
      for (const a of atts) {
        await db.attachments.put({ ...a, ownerId: newOwnerId });
      }

      const tools = await db.toolStates.where('ownerId').equals('local').toArray();
      for (const t of tools) {
        await db.toolStates.put({ ...t, ownerId: newOwnerId, updatedAt: now });
      }

      const acrs = await db.attackChainRuns.where('ownerId').equals('local').toArray();
      for (const r of acrs) {
        await db.attackChainRuns.put({ ...r, ownerId: newOwnerId });
      }

      const gms = await db.godmodeRuns.where('ownerId').equals('local').toArray();
      for (const g of gms) {
        await db.godmodeRuns.put({ ...g, ownerId: newOwnerId });
      }

      const ass = await db.attackSessions.where('ownerId').equals('local').toArray();
      for (const s of ass) {
        await db.attackSessions.put({ ...s, ownerId: newOwnerId });
      }
    }
  );
  return chatCount;
}

/** localStorage flag so the claim banner only shows once per user.
 *  Returns true on the first call for a given userId, false thereafter. */
export function shouldShowClaimBanner(userId: string): boolean {
  if (!userId || userId === 'local') return false;
  if (typeof localStorage === 'undefined') return false;
  const key = `cryptex.claimed.${userId}`;
  return localStorage.getItem(key) !== '1';
}

/** Mark the claim flow complete for this user — won't surface again. */
export function markClaimComplete(userId: string): void {
  if (!userId || userId === 'local') return;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`cryptex.claimed.${userId}`, '1');
  } catch {
    // Quota / disabled storage — non-fatal
  }
}
