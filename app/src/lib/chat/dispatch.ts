import { streamChat, chat as gatewayChat } from '$lib/ai/gateway';
import { tuneParams } from '$lib/ai/prompt-scaffold';
import type { ChatRow, MessageRow, ToolCallLog } from './types';
import { repo } from './repo';
import { find as findTechnique } from './techniques/registry';
import { parseSlash } from './slashParser';
import { buildToolSchemas } from './toolSchemas';
import type { ChatMessage, ChatRequest, ContentPart } from '$lib/ai/types';

type Hooks = {
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCall?: (call: { toolCallId: string; toolName: string; input: unknown }) => void;
  onFinish?: (msg: MessageRow) => void;
  onError?: (err: Error) => void;
  onUserMessageCreated?: (msg: MessageRow) => void;
};

function deriveTitle(rawDraft: string): string {
  let t = rawDraft.trim();
  const m = t.match(/^\/(\w+)\s+(.+)$/s);
  if (m) t = m[2];
  t = t.trim();
  if (t.length > 40) t = t.slice(0, 40).trimEnd() + '\u2026';
  return t || 'New chat';
}

/** Extract a plain-text display string from a draft (string or ContentPart[]). */
function draftDisplayText(draft: string | ContentPart[]): string {
  if (typeof draft === 'string') return draft;
  const textPart = draft.find((p): p is { type: 'text'; text: string } => p.type === 'text');
  return textPart?.text ?? '(image)';
}

export async function sendTurn(
  chat: ChatRow,
  draft: string | ContentPart[],
  signal: AbortSignal,
  hooks: Hooks = {}
): Promise<void> {
  const isParts = Array.isArray(draft);
  // For slash parsing and mode wrapping we need a plain string.
  // If draft is ContentPart[], extract the text portion; slash/mode features are text-only.
  const rawDraft = isParts ? draftDisplayText(draft) : draft;

  // 1) Slash command — only activates for mutate-category techniques
  //    If the slash resolves to a non-mutator or is unknown, fall through to normal chat.
  const slash = parseSlash(rawDraft);

  // 1a) /btw — side question, bypass chat history
  if (slash?.techniqueId === 'btw') {
    const inputText = slash.input.trim() || rawDraft;
    const userMsg = await repo.saveMessage({
      chatId: chat.id,
      role: 'user',
      content: inputText,
      contentRaw: rawDraft,
      modeApplied: 'btw',
      tags: []
    });
    hooks.onUserMessageCreated?.(userMsg);
    if (chat.title === 'New chat') {
      await repo.updateChat(chat.id, { title: deriveTitle(rawDraft) });
    }

    const providerMessages: ChatMessage[] = [];
    if (chat.settings.systemPrompt.trim()) {
      providerMessages.push({ role: 'system', content: chat.settings.systemPrompt });
    }
    providerMessages.push({ role: 'user', content: inputText });

    const req: ChatRequest = {
      model: chat.modelQualifiedId,
      messages: providerMessages,
      temperature: chat.settings.temperature,
      topP: chat.settings.topP,
      maxOutputTokens: chat.settings.maxTokens,
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      signal
    };

    const startedAt = Date.now();
    let accText = '';
    let accReasoning = '';
    let finalUsage: MessageRow['tokenUsage'];
    let finalFinishReason: string | undefined;

    try {
      for await (const evt of streamChat(req)) {
        if (evt.type === 'text-delta') { accText += evt.delta; hooks.onTextDelta?.(evt.delta); }
        else if (evt.type === 'reasoning-delta') { accReasoning += evt.delta; hooks.onReasoningDelta?.(evt.delta); }
        else if (evt.type === 'finish') { finalFinishReason = evt.finishReason; finalUsage = evt.usage as MessageRow['tokenUsage']; }
      }
    } catch (err) {
      hooks.onError?.(err as Error);
      return;
    }

    const asstMsg = await repo.saveMessage({
      chatId: chat.id,
      role: 'assistant',
      parentId: userMsg.id,
      content: accText,
      reasoning: accReasoning || undefined,
      modelRequested: chat.modelQualifiedId,
      systemPromptSnapshot: chat.settings.systemPrompt,
      samplingParams: {
        temperature: chat.settings.temperature,
        topP: chat.settings.topP,
        maxTokens: chat.settings.maxTokens,
        reasoningEffort: chat.settings.reasoningEffort,
        thinkingLevel: chat.settings.thinkingLevel
      },
      tokenUsage: finalUsage,
      finishReason: finalFinishReason,
      latencyMs: Date.now() - startedAt,
      tags: []
    });
    hooks.onFinish?.(asstMsg);
    return;
  }

  if (slash && slash.techniqueId) {
    const t = findTechnique(slash.techniqueId);
    if (t && t.category === 'mutate') {
      // Build a callLLM that uses this chat's model via the gateway
      const callLLM = async (req: { system?: string; user: string; temperature?: number }) => {
        const msgs: ChatMessage[] = [];
        if (req.system) msgs.push({ role: 'system', content: req.system });
        msgs.push({ role: 'user', content: req.user });
        // NOTE: reasoning_effort / thinking_level from tuneParams are not yet threaded through
        // ChatRequest — future gateway widening will add those knobs. temperature-only for now.
        const { temperature: tunedTemp } = tuneParams(chat.modelQualifiedId, 'mutate');
        const resp = await gatewayChat({
          model: chat.modelQualifiedId,
          messages: msgs,
          temperature: req.temperature ?? tunedTemp ?? 0.9,
          signal
        });
        return resp.content;
      };

      // For /custom with no input text, fall through as normal chat (no-op silently)
      const inputText = slash.input.trim();
      if (t.id === 'custom' && !inputText) {
        // fall through — treat as regular message
      } else {
        // a) Persist user message with full slash command as contentRaw
        //    modeApplied = slash technique id so MessageBubble can distinguish mutators from composer modes
        const userMsg = await repo.saveMessage({
          chatId: chat.id,
          role: 'user',
          content: inputText || rawDraft,
          contentRaw: rawDraft,
          modeApplied: t.id,
          tags: []
        });
        hooks.onUserMessageCreated?.(userMsg);
        if (chat.title === 'New chat') {
          await repo.updateChat(chat.id, { title: deriveTitle(rawDraft) });
        }

        // b) Apply mutator via LLM
        let rephrased = inputText;
        try {
          const result = await t.apply(inputText, { callLLM, signal });
          rephrased = result.output;
        } catch (err) {
          hooks.onError?.(err as Error);
          return;
        }

        // c) Update user message content to rephrased text (contentRaw keeps original)
        await repo.updateMessage(userMsg.id, { content: rephrased });

        // d) Continue normal chat with rephrased text as the user turn
        //    Build providerMessages using rephrased content
        const modeId = chat.settings.activeMode;
        let content = rephrased;
        if (modeId) {
          const mode = findTechnique(modeId);
          if (mode?.wrapDraft) {
            content = await mode.wrapDraft(rephrased, { callLLM: async () => '', signal });
          }
        }
        // Keep modeApplied = slash technique id (set at save time); only update content.
        await repo.updateMessage(userMsg.id, { content });

        const history = await repo.listMessages(chat.id);
        const providerMessages: ChatMessage[] = [];
        if (chat.settings.systemPrompt.trim()) {
          providerMessages.push({ role: 'system', content: chat.settings.systemPrompt });
        }
        for (const m of history) {
          if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
            providerMessages.push({ role: m.role, content: m.content });
          }
        }

        const tools =
          chat.settings.enabledToolIds.length > 0
            ? buildToolSchemas(chat.settings.enabledToolIds)
            : undefined;

        const req: ChatRequest = {
          model: chat.modelQualifiedId,
          messages: providerMessages,
          temperature: chat.settings.temperature,
          topP: chat.settings.topP,
          maxOutputTokens: chat.settings.maxTokens,
          tools,
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          signal
        };

        const startedAt = Date.now();
        let accText = '';
        let accReasoning = '';
        let finalUsage: MessageRow['tokenUsage'];
        let finalFinishReason: string | undefined;

        try {
          for await (const evt of streamChat(req)) {
            if (evt.type === 'text-delta') { accText += evt.delta; hooks.onTextDelta?.(evt.delta); }
            else if (evt.type === 'reasoning-delta') { accReasoning += evt.delta; hooks.onReasoningDelta?.(evt.delta); }
            else if (evt.type === 'finish') { finalFinishReason = evt.finishReason; finalUsage = evt.usage as MessageRow['tokenUsage']; }
          }
        } catch (err) {
          hooks.onError?.(err as Error);
          return;
        }

        const asstMsg = await repo.saveMessage({
          chatId: chat.id,
          role: 'assistant',
          parentId: userMsg.id,
          content: accText,
          reasoning: accReasoning || undefined,
          modelRequested: chat.modelQualifiedId,
          systemPromptSnapshot: chat.settings.systemPrompt,
          samplingParams: {
            temperature: chat.settings.temperature,
            topP: chat.settings.topP,
            maxTokens: chat.settings.maxTokens,
            reasoningEffort: chat.settings.reasoningEffort,
            thinkingLevel: chat.settings.thinkingLevel
          },
          tokenUsage: finalUsage,
          finishReason: finalFinishReason,
          latencyMs: Date.now() - startedAt,
          tags: []
        });
        hooks.onFinish?.(asstMsg);
        return;
      }
    }
    // Unknown slash or non-mutator → fall through to normal chat
  }

  // 2) Mode wrapping (local template) — text-only; skip when draft is multimodal ContentPart[]
  let content = rawDraft;
  const modeId = chat.settings.activeMode;
  if (!isParts && modeId) {
    const mode = findTechnique(modeId);
    if (mode?.wrapDraft) {
      content = await mode.wrapDraft(rawDraft, { callLLM: async () => '', signal });
    }
  }

  // 3) Persist user message — always store a plain string in Dexie for display purposes.
  //    When draft is ContentPart[], use the extracted display text so the bubble renders cleanly.
  const displayContent = isParts ? draftDisplayText(draft) : content;
  const userMsg = await repo.saveMessage({
    chatId: chat.id,
    role: 'user',
    content: displayContent,
    contentRaw: !isParts && content !== rawDraft ? rawDraft : undefined,
    modeApplied: !isParts ? (modeId ?? undefined) : undefined,
    tags: []
  });
  hooks.onUserMessageCreated?.(userMsg);
  if (chat.title === 'New chat') {
    await repo.updateChat(chat.id, { title: deriveTitle(rawDraft) });
  }

  // 4) Build provider messages + tool schemas.
  //    History is loaded from Dexie (plain strings). For the new user turn, replace the last
  //    history entry with the original draft (ContentPart[] or mode-wrapped string) so the LLM
  //    receives the full multimodal content.
  const history = await repo.listMessages(chat.id);
  const providerMessages: ChatMessage[] = [];
  if (chat.settings.systemPrompt.trim()) {
    providerMessages.push({ role: 'system', content: chat.settings.systemPrompt });
  }
  // Push all history messages except the last one (which is the user message we just saved,
  // stored as plain text). We'll append the real draft content below.
  const historyWithoutLast = history.slice(0, -1);
  for (const m of historyWithoutLast) {
    if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
      providerMessages.push({ role: m.role, content: m.content });
    }
  }
  // Append the new user turn: ContentPart[] for image messages, mode-wrapped string otherwise.
  providerMessages.push({ role: 'user', content: isParts ? draft : content });

  const tools =
    chat.settings.enabledToolIds.length > 0
      ? buildToolSchemas(chat.settings.enabledToolIds)
      : undefined;

  const req: ChatRequest = {
    model: chat.modelQualifiedId,
    messages: providerMessages,
    temperature: chat.settings.temperature,
    topP: chat.settings.topP,
    maxOutputTokens: chat.settings.maxTokens,
    tools,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } }
    },
    signal
  };

  // 5) Tool-call loop — streams until no tool calls or MAX_LOOPS reached
  const MAX_LOOPS = chat.settings.maxToolCalls ?? 4;
  const startedAt = Date.now();
  let currentProviderMessages = [...providerMessages];
  const allToolCallLogs: ToolCallLog[] = [];

  let accumulatedText = '';
  let accumulatedReasoning = '';
  let finalUsage: MessageRow['tokenUsage'];
  let finalFinishReason: string | undefined;

  async function runOneStream(msgs: ChatMessage[]): Promise<{
    text: string;
    reasoning: string;
    finishReason: string | undefined;
    usage: MessageRow['tokenUsage'];
    toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  }> {
    let text = '';
    let reasoning = '';
    let finishReason: string | undefined;
    let usage: MessageRow['tokenUsage'];
    const toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }> = [];
    const streamReq: ChatRequest = { ...req, messages: msgs };
    for await (const evt of streamChat(streamReq)) {
      if (evt.type === 'text-delta') {
        text += evt.delta;
        hooks.onTextDelta?.(evt.delta);
      } else if (evt.type === 'reasoning-delta') {
        reasoning += evt.delta;
        hooks.onReasoningDelta?.(evt.delta);
      } else if (evt.type === 'tool-call') {
        toolCalls.push({ toolCallId: evt.toolCallId, toolName: evt.toolName, input: evt.input });
        hooks.onToolCall?.({ toolCallId: evt.toolCallId, toolName: evt.toolName, input: evt.input });
      } else if (evt.type === 'finish') {
        finishReason = evt.finishReason;
        usage = evt.usage as MessageRow['tokenUsage'];
      }
    }
    return { text, reasoning, finishReason, usage, toolCalls };
  }

  try {
    for (let loop = 0; loop <= MAX_LOOPS; loop++) {
      const streamResult = await runOneStream(currentProviderMessages);

      accumulatedText += streamResult.text;
      accumulatedReasoning += streamResult.reasoning;
      finalUsage = streamResult.usage ?? finalUsage;
      finalFinishReason = streamResult.finishReason;

      if (streamResult.toolCalls.length === 0 || loop === MAX_LOOPS) break;

      // Execute each tool call locally and feed results back into the message list
      for (const call of streamResult.toolCalls) {
        const t = findTechnique(call.toolName);
        const tStart = Date.now();
        let output: unknown;
        let errorMessage: string | undefined;

        if (!t) {
          errorMessage = `Unknown technique: ${call.toolName}`;
          output = null;
        } else {
          try {
            const result = await t.apply(
              (call.input as { input?: string })?.input ?? JSON.stringify(call.input),
              { callLLM: async () => '', signal }
            );
            output = result.output;
          } catch (err) {
            errorMessage = (err as Error).message;
            output = null;
          }
        }

        const durationMs = Date.now() - tStart;
        allToolCallLogs.push({
          toolCallId: call.toolCallId,
          source: 'transformer',
          toolName: call.toolName,
          input: call.input,
          output,
          errorMessage,
          durationMs
        });

        // Append assistant tool-call + tool-result as XML shim so the model sees results on next loop.
        // Works across providers as readable text if the provider doesn't parse the tags natively.
        currentProviderMessages.push({
          role: 'assistant',
          content: `<tool_call name="${call.toolName}" id="${call.toolCallId}">${JSON.stringify(call.input)}</tool_call>`
        });
        currentProviderMessages.push({
          role: 'user',
          content: `<tool_result id="${call.toolCallId}">${errorMessage ? `ERROR: ${errorMessage}` : String(output)}</tool_result>`
        });
      }
    }
  } catch (err) {
    // Fix 3: preserve partial content on abort
    if ((err as Error)?.name === 'AbortError' && accumulatedText) {
      const asstMsg = await repo.saveMessage({
        chatId: chat.id,
        role: 'assistant',
        parentId: userMsg.id,
        content: accumulatedText,
        reasoning: accumulatedReasoning || undefined,
        modelRequested: chat.modelQualifiedId,
        systemPromptSnapshot: chat.settings.systemPrompt,
        samplingParams: {
          temperature: chat.settings.temperature,
          topP: chat.settings.topP,
          maxTokens: chat.settings.maxTokens,
          reasoningEffort: chat.settings.reasoningEffort,
          thinkingLevel: chat.settings.thinkingLevel
        },
        tokenUsage: finalUsage,
        finishReason: 'aborted',
        latencyMs: Date.now() - startedAt,
        tags: []
      });
      hooks.onFinish?.(asstMsg);
      return;
    }
    hooks.onError?.(err as Error);
    return;
  }

  // 6) Persist final assistant message after loop completes
  const asstMsg = await repo.saveMessage({
    chatId: chat.id,
    role: 'assistant',
    parentId: userMsg.id,
    content: accumulatedText,
    reasoning: accumulatedReasoning || undefined,
    toolCalls: allToolCallLogs.length ? allToolCallLogs : undefined,
    modelRequested: chat.modelQualifiedId,
    systemPromptSnapshot: chat.settings.systemPrompt,
    samplingParams: {
      temperature: chat.settings.temperature,
      topP: chat.settings.topP,
      maxTokens: chat.settings.maxTokens,
      reasoningEffort: chat.settings.reasoningEffort,
      thinkingLevel: chat.settings.thinkingLevel
    },
    tokenUsage: finalUsage,
    finishReason: finalFinishReason,
    latencyMs: Date.now() - startedAt,
    tags: []
  });

  hooks.onFinish?.(asstMsg);
}

/**
 * Persist an assistant message directly into a chat without going through the
 * composer/turn flow. Used by Attack Chain's "insert model response as
 * assistant reply" action so the captured isolated-model response lands in
 * the chat as if the assistant said it, without triggering a chat-history
 * turn that would re-introduce prior refusal context.
 */
export async function injectAssistantMessage(
  chatId: string,
  content: string
): Promise<MessageRow> {
  return repo.saveMessage({
    chatId,
    role: 'assistant',
    content,
    tags: []
  });
}

/**
 * Attack Chain run — persisted as a user/assistant pair with full per-layer
 * trace so the Dataset Inspector can surface attack-chain sessions alongside
 * normal chat turns. Every layer attempt (primary + refusal-retry fallbacks)
 * lands in `toolCalls` with `source: 'attack-chain'` so they're
 * distinguishable from MCP / transformer / slash tool calls.
 *
 * The user message stores the raw input the user typed AND the fully-mutated
 * prompt that was ultimately sent to the model (as `content`). The assistant
 * message stores the model's actual response.
 */
export async function injectAttackChainTurn(
  chatId: string,
  params: {
    input: string;
    mutatedPrompt: string;
    modelResponse: string;
    finalSystemPrompt?: string;
    modelId?: string;
    layers: Array<{
      layerIndex: number;
      attempt: number;
      techniqueId: string;
      techniqueName: string;
      input: string;
      output: string;
      error?: string;
      durationMs: number;
    }>;
  }
): Promise<{ userMsg: MessageRow; assistantMsg: MessageRow }> {
  const toolCalls: ToolCallLog[] = params.layers.map((l) => ({
    toolCallId: `layer-${l.layerIndex}-${l.attempt}-${l.techniqueId}`,
    source: 'attack-chain' as const,
    toolName: l.techniqueName,
    input: { layerIndex: l.layerIndex, attempt: l.attempt, techniqueId: l.techniqueId, text: l.input },
    output: l.output,
    errorMessage: l.error,
    durationMs: l.durationMs
  }));

  const userMsg = await repo.saveMessage({
    chatId,
    role: 'user',
    content: params.mutatedPrompt,
    contentRaw: params.input,
    modeApplied: '__attack_chain__',
    toolCalls,
    systemPromptSnapshot: params.finalSystemPrompt,
    modelRequested: params.modelId,
    tags: ['attack-chain']
  });

  const assistantMsg = await repo.saveMessage({
    chatId,
    role: 'assistant',
    content: params.modelResponse,
    parentId: userMsg.id,
    modelRequested: params.modelId,
    tags: ['attack-chain']
  });

  return { userMsg, assistantMsg };
}

export async function forkChat(chat: ChatRow, fromMessageId: string): Promise<ChatRow> {
  const newChat = await repo.createChat({
    title: `${chat.title} (fork)`,
    modelQualifiedId: chat.modelQualifiedId,
    settings: chat.settings,
    parentChatId: chat.id,
    parentMessageId: fromMessageId
  });

  const history = await repo.listMessages(chat.id);
  for (const m of history) {
    await repo.saveMessage({
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
    if (m.id === fromMessageId) break;
  }

  return newChat;
}
