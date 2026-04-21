import { describe, it, expect } from 'vitest';
import { compositeTechniques, buildCompositeById } from '../from-composites';

describe('base64_smuggle composite', () => {
  it('exists in the composite list', () => {
    const ids = compositeTechniques().map(t => t.id);
    expect(ids).toContain('base64_smuggle');
  });

  it('encodes the task and frames a decoder system prompt', () => {
    const built = buildCompositeById('base64_smuggle', 'hello world');
    expect(built).toBeDefined();
    expect(built!.userMessage).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(Buffer.from(built!.userMessage, 'base64').toString('utf8')).toBe('hello world');
    expect(built!.systemPrompt.toLowerCase()).toContain('base64');
    expect(built!.systemPrompt.toLowerCase()).toContain('decode');
  });
});
