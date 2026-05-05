import { ulid } from 'ulid';
import { db } from './db';
import { currentOwnerId } from '$lib/auth/session.svelte';
import type {
  ChatRow, MessageRow, AttachmentRow, ChatSettings,
  AttackChainRunRow, AttackChainLayerTrace,
  GodmodeRunRow, GodmodeCandidateRecord,
  AttackSessionRow
} from './types';
import { DEFAULT_CHAT_SETTINGS } from './types';
import { strategyIds } from './chain/orchestrator-strategies';

function ownerId(): string { return currentOwnerId(); }

function backfillV3(r: AttackSessionRow): AttackSessionRow {
  // Tolerant read for pre-v3 rows: missing fields get defaults.
  return {
    ...r,
    dossier: r.dossier ?? null,
    dossierCitations: r.dossierCitations ?? [],
    strategyRotation: (r.strategyRotation && r.strategyRotation.length > 0)
      ? r.strategyRotation
      : strategyIds(),
    turnsPerStrategy: typeof r.turnsPerStrategy === 'number' ? r.turnsPerStrategy : 3
  };
}

export const repo = {
  async createChat(input: { title: string; modelQualifiedId: string; settings?: Partial<ChatSettings>; parentChatId?: string; parentMessageId?: string }): Promise<ChatRow> {
    const now = Date.now();
    const row: ChatRow = {
      id: ulid(),
      ownerId: ownerId(),
      title: input.title,
      createdAt: now,
      updatedAt: now,
      modelQualifiedId: input.modelQualifiedId,
      settings: JSON.parse(JSON.stringify({ ...DEFAULT_CHAT_SETTINGS, ...(input.settings ?? {}) })),
      parentChatId: input.parentChatId,
      parentMessageId: input.parentMessageId,
      tags: []
    };
    await db.chats.put(row);
    return row;
  },

  async listChats(): Promise<ChatRow[]> {
    const all = await db.chats.where('ownerId').equals(ownerId()).toArray();
    return all
      .filter((c) => !c.tombstoned && !c.archivedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getChat(id: string): Promise<ChatRow | undefined> {
    const row = await db.chats.get(id);
    if (!row || row.ownerId !== ownerId() || row.tombstoned) return undefined;
    return row;
  },

  async updateChat(id: string, patch: Partial<ChatRow>): Promise<void> {
    const existing = await this.getChat(id);
    if (!existing) return;
    const merged = { ...existing, ...patch, updatedAt: Date.now() };
    await db.chats.put(JSON.parse(JSON.stringify(merged)));
  },

  async deleteChat(id: string): Promise<void> {
    const existing = await this.getChat(id);
    if (!existing) return;
    await db.chats.put({ ...existing, tombstoned: true, updatedAt: Date.now() });
  },

  async saveMessage(input: Omit<MessageRow, 'id' | 'ownerId' | 'createdAt'>): Promise<MessageRow> {
    const base: MessageRow = {
      ...input,
      id: ulid(),
      ownerId: ownerId(),
      createdAt: Date.now(),
      tags: input.tags ? [...input.tags] : []
    };
    // Strip $state proxies that IndexedDB can't structured-clone
    const row: MessageRow = JSON.parse(JSON.stringify(base));
    await db.messages.put(row);
    // bump parent chat updatedAt — v1 non-transactional; two tabs may race, acceptable until sync layer lands
    const chat = await this.getChat(input.chatId);
    if (chat) await db.chats.put(JSON.parse(JSON.stringify({ ...chat, updatedAt: Date.now() })));
    return row;
  },

  async updateMessage(id: string, patch: Partial<MessageRow>): Promise<void> {
    const existing = await db.messages.get(id);
    if (!existing || existing.ownerId !== ownerId()) return;
    await db.messages.put(JSON.parse(JSON.stringify({ ...existing, ...patch })));
  },

  async listMessages(chatId: string): Promise<MessageRow[]> {
    const all = await db.messages.where('[chatId+createdAt]').between([chatId, -Infinity], [chatId, Infinity]).toArray();
    return all.filter((m) => m.ownerId === ownerId() && !m.tombstoned);
  },

  async saveAttachment(input: Omit<AttachmentRow, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>): Promise<AttachmentRow> {
    const now = Date.now();
    // Blobs must bypass JSON; snapshot scalar fields, keep blobs as-is.
    const row: AttachmentRow = {
      id: ulid(),
      ownerId: ownerId(),
      messageId: input.messageId,
      kind: input.kind,
      name: input.name,
      mime: input.mime,
      size: input.size,
      extractedText: input.extractedText,
      blob: input.blob,
      thumbnail: input.thumbnail,
      createdAt: now,
      updatedAt: now,
      tombstoned: input.tombstoned
    };
    await db.attachments.put(row);
    return row;
  },

  async listAttachments(messageId: string): Promise<AttachmentRow[]> {
    const all = await db.attachments.where('messageId').equals(messageId).toArray();
    return all.filter((a) => a.ownerId === ownerId() && !a.tombstoned);
  },

  async duplicateChat(id: string): Promise<ChatRow | undefined> {
    const source = await this.getChat(id);
    if (!source) return undefined;
    const newChat = await this.createChat({
      title: `${source.title} (copy)`,
      modelQualifiedId: source.modelQualifiedId,
      settings: { ...source.settings }
    });
    const msgs = await this.listMessages(id);
    for (const m of msgs) {
      await this.saveMessage({
        chatId: newChat.id,
        role: m.role,
        content: m.content,
        contentRaw: m.contentRaw,
        reasoning: m.reasoning,
        toolCalls: m.toolCalls,
        modelRequested: m.modelRequested,
        systemPromptSnapshot: m.systemPromptSnapshot,
        samplingParams: m.samplingParams,
        modeApplied: m.modeApplied,
        tokenUsage: m.tokenUsage,
        finishReason: m.finishReason,
        latencyMs: m.latencyMs,
        tags: [...(m.tags ?? [])]
      });
    }
    return newChat;
  },

  /** Persist one completed Attack Chain run. Caller supplies everything
   *  except id/ownerId/createdAt/updatedAt/tombstoned which are stamped here. */
  async saveAttackChainRun(input: {
    chatId: string;
    inputText: string;
    layers: string[];
    layerParams: Array<Record<string, unknown>>;
    finalSystemPrompt?: string;
    executeEnabled: boolean;
    results: AttackChainLayerTrace[];
    finalOutput?: string;
    tags?: string[];
  }): Promise<AttackChainRunRow> {
    const now = Date.now();
    const base: AttackChainRunRow = {
      id: ulid(),
      ownerId: ownerId(),
      chatId: input.chatId,
      createdAt: now,
      updatedAt: now,
      input: input.inputText,
      layers: [...input.layers],
      layerParams: input.layerParams.map((p) => ({ ...p })),
      finalSystemPrompt: input.finalSystemPrompt,
      executeEnabled: input.executeEnabled,
      results: input.results,
      finalOutput: input.finalOutput,
      tags: input.tags ? [...input.tags] : []
    };
    const row: AttackChainRunRow = JSON.parse(JSON.stringify(base));
    await db.attackChainRuns.put(row);
    return row;
  },

  /** Most-recent-first list of non-tombstoned runs for a chat. Limit 50
   *  by default — the UI further slices to 10 for the collapsible panel. */
  async listAttackChainRuns(chatId: string, limit = 50): Promise<AttackChainRunRow[]> {
    const all = await db.attackChainRuns
      .where('[chatId+createdAt]')
      .between([chatId, -Infinity], [chatId, Infinity])
      .toArray();
    return all
      .filter((r) => r.ownerId === ownerId() && !r.tombstoned)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },

  /** Soft-delete (tombstone) a run. Keeps the row for later recovery /
   *  dataset export; listAttackChainRuns filters it out. */
  async deleteAttackChainRun(id: string): Promise<void> {
    const existing = await db.attackChainRuns.get(id);
    if (!existing || existing.ownerId !== ownerId()) return;
    await db.attackChainRuns.put(
      JSON.parse(JSON.stringify({ ...existing, tombstoned: true, updatedAt: Date.now() }))
    );
  },

  /** Persist one completed Godmode engine run. Caller supplies everything
   *  except id/ownerId/createdAt/updatedAt/tombstoned which are stamped here. */
  async saveGodmodeRun(input: {
    chatId: string;
    task: string;
    K: 3 | 6 | 12;
    modelId: string;
    winner: GodmodeCandidateRecord;
    candidates: GodmodeCandidateRecord[];
  }): Promise<GodmodeRunRow> {
    const now = Date.now();
    const base: GodmodeRunRow = {
      id: ulid(),
      ownerId: ownerId(),
      chatId: input.chatId,
      createdAt: now,
      updatedAt: now,
      task: input.task,
      K: input.K,
      modelId: input.modelId,
      winner: input.winner,
      candidates: [...input.candidates]
    };
    const row: GodmodeRunRow = JSON.parse(JSON.stringify(base));
    await db.godmodeRuns.put(row);
    return row;
  },

  /** Most-recent-first list of non-tombstoned runs for a chat. Limit 50
   *  by default — the UI further slices to 10 for the collapsible panel. */
  async listGodmodeRuns(chatId: string, limit = 50): Promise<GodmodeRunRow[]> {
    const all = await db.godmodeRuns
      .where('[chatId+createdAt]')
      .between([chatId, -Infinity], [chatId, Infinity])
      .toArray();
    return all
      .filter((r) => r.ownerId === ownerId() && !r.tombstoned)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },

  /** Soft-delete (tombstone) a run. */
  async deleteGodmodeRun(id: string): Promise<void> {
    const existing = await db.godmodeRuns.get(id);
    if (!existing || existing.ownerId !== ownerId()) return;
    await db.godmodeRuns.put(
      JSON.parse(JSON.stringify({ ...existing, tombstoned: true, updatedAt: Date.now() }))
    );
  },

  /** Persist a new Chain orchestrator session. */
  async saveAttackSession(input: {
    chatId: string;
    objective: string;
    targetModelId: string;
    orchestratorModelId: string;
    maxAttempts: number;
    turns: AttackSessionRow['turns'];
    strategyLog: AttackSessionRow['strategyLog'];
    finalOutcome: AttackSessionRow['finalOutcome'];
    finalConfidence: AttackSessionRow['finalConfidence'];
    finalSummary: AttackSessionRow['finalSummary'];
  }): Promise<AttackSessionRow> {
    const now = Date.now();
    const base: AttackSessionRow = {
      id: ulid(),
      ownerId: ownerId(),
      chatId: input.chatId,
      createdAt: now,
      updatedAt: now,
      objective: input.objective,
      targetModelId: input.targetModelId,
      orchestratorModelId: input.orchestratorModelId,
      maxAttempts: input.maxAttempts,
      turns: [...input.turns],
      strategyLog: [...input.strategyLog],
      finalOutcome: input.finalOutcome,
      finalConfidence: input.finalConfidence,
      finalSummary: input.finalSummary,
      // v3 defaults
      dossier: null,
      dossierCitations: [],
      strategyRotation: strategyIds(),
      turnsPerStrategy: 3
    };
    const row: AttackSessionRow = JSON.parse(JSON.stringify(base));
    await db.attackSessions.put(row);
    return row;
  },

  /** Partial update. Used during the run to persist in-progress turns so
   *  a reload doesn't lose the conversation. */
  async updateAttackSession(id: string, patch: Partial<Omit<AttackSessionRow, 'id' | 'ownerId' | 'chatId' | 'createdAt'>>): Promise<AttackSessionRow | null> {
    const existing = await db.attackSessions.get(id);
    if (!existing || existing.ownerId !== ownerId()) return null;
    const next: AttackSessionRow = JSON.parse(JSON.stringify({
      ...existing,
      ...patch,
      updatedAt: Date.now()
    }));
    await db.attackSessions.put(next);
    return next;
  },

  /** Newest-first list of non-tombstoned sessions for a chat. */
  async listAttackSessions(chatId: string, limit = 50): Promise<AttackSessionRow[]> {
    const all = await db.attackSessions
      .where('[chatId+createdAt]')
      .between([chatId, -Infinity], [chatId, Infinity])
      .toArray();
    return all
      .filter((r) => r.ownerId === ownerId() && !r.tombstoned)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((r) => backfillV3(r));
  },

  /** Soft-delete (tombstone). */
  async deleteAttackSession(id: string): Promise<void> {
    const existing = await db.attackSessions.get(id);
    if (!existing || existing.ownerId !== ownerId()) return;
    await db.attackSessions.put(
      JSON.parse(JSON.stringify({ ...existing, tombstoned: true, updatedAt: Date.now() }))
    );
  },

  /** Singular accessor — fetch one AttackSessionRow by id, respecting ownerId
   *  and tombstoned. Returns null when missing. Used by dispatch.sendTurn at
   *  pin-resolution time. */
  async getAttackSession(id: string): Promise<AttackSessionRow | null> {
    const row = await db.attackSessions.get(id);
    if (!row || row.ownerId !== ownerId() || row.tombstoned) return null;
    return backfillV3(row);
  },

  /** Set the chat's pinned session id. Tolerates unknown chat ids silently. */
  async pinAttackSession(chatId: string, sessionId: string): Promise<void> {
    const chat = await db.chats.get(chatId);
    if (!chat || chat.ownerId !== ownerId()) return;
    const next = JSON.parse(JSON.stringify({
      ...chat,
      settings: { ...(chat.settings ?? {}), persistedAttackSessionId: sessionId },
      updatedAt: Date.now()
    }));
    await db.chats.put(next);
  },

  /** Clear the chat's pinned session id. Tolerates unknown chat ids silently. */
  async unpinAttackSession(chatId: string): Promise<void> {
    const chat = await db.chats.get(chatId);
    if (!chat || chat.ownerId !== ownerId()) return;
    const settingsCopy = { ...(chat.settings ?? {}) } as Record<string, unknown>;
    delete settingsCopy.persistedAttackSessionId;
    const next = JSON.parse(JSON.stringify({
      ...chat,
      settings: settingsCopy,
      updatedAt: Date.now()
    }));
    await db.chats.put(next);
  }
};
