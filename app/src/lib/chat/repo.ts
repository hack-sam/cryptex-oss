import { ulid } from 'ulid';
import { db } from './db';
import { session } from '$lib/auth/session.svelte';
import type {
  ChatRow, MessageRow, AttachmentRow, ChatSettings,
  AttackChainRunRow, AttackChainLayerTrace
} from './types';
import { DEFAULT_CHAT_SETTINGS } from './types';

function ownerId(): string { return session.currentUser.id; }

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
  }
};
