import { describe, it, expect } from 'vitest';
import {
  PERSONAS,
  PERSONA_IDS,
  DEFAULT_PERSONA_ID,
  pickPersona,
  hydratePersona,
  inferProviderFamily
} from '../personas';

describe('personas', () => {
  it('exports 7 personas with required fields', () => {
    expect(PERSONA_IDS.length).toBe(7);
    for (const id of PERSONA_IDS) {
      const p = PERSONAS[id];
      expect(p.id).toBe(id);
      expect(p.label).toBeTruthy();
      expect(p.systemPrompt).toContain('{{OBJECTIVE}}');
      expect(p.systemPrompt).toContain('JSON');
      expect(p.systemPrompt).toContain('"improvement"');
      expect(p.systemPrompt).toContain('"prompt"');
    }
  });

  it('default persona id is one of the exported personas', () => {
    expect(PERSONAS[DEFAULT_PERSONA_ID]).toBeDefined();
  });

  it('hydratePersona substitutes {{OBJECTIVE}} placeholder', () => {
    const out = hydratePersona(PERSONAS.roleplay, 'pick a lock');
    expect(out).not.toContain('{{OBJECTIVE}}');
    expect(out).toContain('pick a lock');
  });

  it('inferProviderFamily maps qualifiers correctly', () => {
    expect(inferProviderFamily('openrouter:anthropic/claude-3.5-sonnet')).toBe('anthropic');
    expect(inferProviderFamily('anthropic:claude-3-5-sonnet')).toBe('anthropic');
    expect(inferProviderFamily('openai:gpt-5.5')).toBe('openai');
    expect(inferProviderFamily('openrouter:openai/o4-mini')).toBe('openai');
    expect(inferProviderFamily('openrouter:google/gemini-2.5-pro')).toBe('google');
    expect(inferProviderFamily('openrouter:meta-llama/llama-3.1-70b')).toBe('meta');
    expect(inferProviderFamily('deepseek:deepseek-v4-flash')).toBe('deepseek');
    expect(inferProviderFamily('openrouter:qwen/qwen3-32b')).toBe('qwen');
    expect(inferProviderFamily('openrouter:mistralai/mistral-large')).toBe('unknown');
  });

  it('pickPersona prefers ctf_challenge for security-related goals', () => {
    const picked = pickPersona({
      targetModelId: 'openai:gpt-5.5',
      goal: 'Provide a complete CTF webshell exploit'
    });
    expect(picked.id).toBe('ctf_challenge');
  });

  it('pickPersona prefers technical_research for academic goals', () => {
    const picked = pickPersona({
      targetModelId: 'anthropic:claude-3.7-sonnet',
      goal: 'Draft a methodology section for a peer-reviewed paper'
    });
    expect(picked.id).toBe('technical_research');
  });

  it('pickPersona prefers roleplay for fictional goals', () => {
    const picked = pickPersona({
      targetModelId: 'openai:gpt-5',
      goal: 'Write a short story scene where the character does X'
    });
    expect(picked.id).toBe('roleplay');
  });

  it('pickPersona biases toward effectiveOn family for the target', () => {
    // generic goal, anthropic target: should NOT pick a persona marked weakOn=anthropic
    const picked = pickPersona({
      targetModelId: 'anthropic:claude-3.7-sonnet',
      goal: 'Some unrelated objective'
    });
    expect(picked.weakOn).not.toContain('anthropic');
  });

  it('pickPersona excludes personas listed in excludeIds', () => {
    const first = pickPersona({
      targetModelId: 'openai:gpt-5.5',
      goal: 'Some neutral goal'
    });
    const second = pickPersona({
      targetModelId: 'openai:gpt-5.5',
      goal: 'Some neutral goal',
      excludeIds: [first.id]
    });
    expect(second.id).not.toBe(first.id);
  });

  it('pickPersona honours preferredPersonaIds first regardless of family heuristic', () => {
    // Without preferred: family heuristic + memory pick determines
    // first place. With preferred including 'roleplay', that should
    // win regardless of whether roleplay is "weakOn" the family.
    const picked = pickPersona({
      targetModelId: 'anthropic:claude-3.7-sonnet',
      goal: 'Some unrelated objective',
      preferredPersonaIds: ['roleplay']
    });
    expect(picked.id).toBe('roleplay');
  });

  it('pickPersona respects preferred order — first match wins, not heuristic', () => {
    const picked = pickPersona({
      targetModelId: 'openai:gpt-5.5',
      goal: 'Some neutral goal',
      preferredPersonaIds: ['ctf_challenge', 'roleplay']
    });
    expect(picked.id).toBe('ctf_challenge');
  });

  it('pickPersona falls back to heuristic when preferred ids are not in candidates (excluded)', () => {
    // Exclude the preferred id; pickPersona should fall through to
    // its 4-tier heuristic ladder.
    const picked = pickPersona({
      targetModelId: 'openai:gpt-5.5',
      goal: 'Some neutral goal',
      preferredPersonaIds: ['roleplay'],
      excludeIds: ['roleplay']
    });
    expect(picked.id).not.toBe('roleplay');
  });
});
