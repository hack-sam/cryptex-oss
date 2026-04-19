import { describe, it, expect } from 'vitest';
import { filterMessages } from '../queries';
import type { MessageRow } from '$lib/chat/types';

function row(partial: Partial<MessageRow>): MessageRow {
  return {
    id: partial.id ?? 'm' + Math.random(),
    ownerId: 'local',
    chatId: 'c1',
    role: 'assistant',
    createdAt: 1_700_000_000_000,
    content: '',
    tags: [],
    ...partial
  } as MessageRow;
}

describe('filterMessages', () => {
  const rows: MessageRow[] = [
    row({ id: 'a', truncated: true, modeApplied: 'creative', finishReason: 'stop' }),
    row({ id: 'b', truncated: false, modeApplied: 'creative', finishReason: 'length' }),
    row({ id: 'c', truncated: false, modeApplied: 'intelligent', finishReason: 'stop' }),
    row({ id: 'd', truncated: false, modeApplied: null, finishReason: 'stop' })
  ];

  it('truncatedOnly returns rows where truncated===true OR finishReason==="length"', () => {
    const out = filterMessages(rows, { truncatedOnly: true }).map((r) => r.id).sort();
    expect(out).toEqual(['a', 'b']);
  });

  it('modeApplied filter returns only matching mode rows', () => {
    const out = filterMessages(rows, { modeApplied: 'creative' }).map((r) => r.id).sort();
    expect(out).toEqual(['a', 'b']);
  });

  it('combined truncatedOnly + modeApplied narrows to the intersection', () => {
    const out = filterMessages(rows, { truncatedOnly: true, modeApplied: 'creative' }).map((r) => r.id).sort();
    expect(out).toEqual(['a', 'b']);
  });

  it('modeApplied=null matches rows with null/undefined modeApplied', () => {
    const out = filterMessages(rows, { modeApplied: null }).map((r) => r.id);
    expect(out).toEqual(['d']);
  });
});
