import { db } from '$lib/chat/db';
import type { MessageRow } from '$lib/chat/types';
import { session } from '$lib/auth/session.svelte';

export interface DatasetFilters {
  /** Restrict to specific chat IDs */
  chatIds?: string[];
  /** Restrict to specific model qualified IDs */
  models?: string[];
  /** Restrict to specific providers */
  providers?: string[];
  /** Row must contain ALL of these tags */
  tags?: string[];
  /** Epoch ms — row.createdAt >= dateFrom */
  dateFrom?: number;
  /** Epoch ms — row.createdAt <= dateTo */
  dateTo?: number;
  /** Only rows that have (or lack) reasoning field */
  hasReasoning?: boolean;
  /** Only rows that have (or lack) toolCalls */
  hasTools?: boolean;
  /** Minimum rating (1–5) */
  minRating?: number;
  /** Filter by trainingInclude flag */
  trainingInclude?: boolean;
  /** Filter by modeApplied value; null matches rows where modeApplied is null/undefined */
  modeApplied?: string | null;
  /** Filter by dataset split */
  split?: 'train' | 'val';
  /** When true, only include rows where truncated===true OR finishReason==='length' */
  truncatedOnly?: boolean;
  /** Owner filter — when provided, only rows whose ownerId matches */
  ownerId?: string;
}

/**
 * Pure filter helper — applies a DatasetFilters set to an already-fetched
 * MessageRow array. Exported so queryMessages can reuse the same predicate
 * and so unit tests can verify filter behavior without a live Dexie DB.
 */
export function filterMessages(rows: MessageRow[], filters: DatasetFilters = {}): MessageRow[] {
  return rows.filter((m) => {
    if (m.tombstoned) return false;

    if (filters.chatIds?.length && !filters.chatIds.includes(m.chatId)) return false;

    if (filters.models?.length) {
      if (!m.modelReturned && !m.modelRequested) return false;
      const model = m.modelReturned ?? m.modelRequested ?? '';
      if (!filters.models.includes(model)) return false;
    }

    if (filters.providers?.length) {
      if (!m.provider) return false;
      if (!filters.providers.includes(m.provider)) return false;
    }

    if (filters.tags?.length) {
      const rowTags = m.tags ?? [];
      if (!filters.tags.every((t) => rowTags.includes(t))) return false;
    }

    if (filters.dateFrom !== undefined && m.createdAt < filters.dateFrom) return false;
    if (filters.dateTo !== undefined && m.createdAt > filters.dateTo) return false;

    if (filters.hasReasoning !== undefined) {
      const has = Boolean(m.reasoning);
      if (filters.hasReasoning !== has) return false;
    }

    if (filters.hasTools !== undefined) {
      const has = Boolean(m.toolCalls?.length);
      if (filters.hasTools !== has) return false;
    }

    if (filters.minRating !== undefined) {
      if (!m.rating || m.rating < filters.minRating) return false;
    }

    if (filters.trainingInclude !== undefined) {
      if (m.trainingInclude !== filters.trainingInclude) return false;
    }

    if (filters.modeApplied !== undefined) {
      const rowMode = m.modeApplied ?? null;
      if (filters.modeApplied !== rowMode) return false;
    }

    if (filters.split !== undefined) {
      if (m.split !== filters.split) return false;
    }

    if (filters.truncatedOnly) {
      const isTruncated = m.truncated === true || m.finishReason === 'length';
      if (!isTruncated) return false;
    }

    return true;
  });
}

/**
 * Read all messages from Dexie and apply DatasetFilters in-memory.
 * Returns only non-tombstoned messages.
 */
export async function queryMessages(filters: DatasetFilters = {}): Promise<MessageRow[]> {
  // Use indexed query when possible to narrow the scan, then filter in memory
  let rows: MessageRow[];

  if (filters.ownerId) {
    rows = await db.messages.where('ownerId').equals(filters.ownerId).toArray();
  } else {
    rows = await db.messages.toArray();
  }

  return filterMessages(rows, filters);
}

/**
 * Count messages belonging to the current user.
 * Use this instead of calling db.messages.count() directly from components.
 */
export async function countMessages(): Promise<number> {
  return db.messages.where('ownerId').equals(session.currentUser.id).count();
}
