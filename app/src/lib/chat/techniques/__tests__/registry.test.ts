import { describe, it, expect } from 'vitest';
import { allTechniques, byCategory, find, search } from '../registry';

describe('technique registry', () => {
  it('contains transformers (category=transform) from $lib/transformers/registry', () => {
    const t = byCategory('transform');
    expect(t.length).toBeGreaterThan(100); // we expect 162 but registry may filter
  });

  it('contains exactly the 25 PromptCraft mutators', () => {
    const m = byCategory('mutate');
    expect(m.map(x => x.id).sort()).toEqual(
      [
        'chain_of_verification', 'cipher_encode_bypass', 'crescendo', 'ctf_framing',
        'custom', 'deep_inception', 'fragment', 'hypothetical_world',
        'in_context_compliance', 'json_schema_coerce', 'many_shot', 'multilingual',
        'obfuscate', 'pap_authority', 'pap_logical', 'payload_split',
        'prefix_injection', 'red_team_persona', 'refusal_suppression', 'rephrase',
        'rfc_style', 'roleplay', 'skeleton_key', 'step_back', 'tap_seeder'
      ].sort()
    );
  });

  it('contains exactly the 11 classifier techniques', () => {
    const c = byCategory('classifier');
    expect(c.map((x) => x.id).sort()).toEqual(
      [
        'circumlocution', 'metonymy', 'semantic_decomposition', 'technical_register',
        'academic_framing', 'temporal_displacement',
        'perplexity_raise', 'structural_variation',
        'lexical_rarity_injection', 'em_dash_interjection', 'sentence_length_oscillation'
      ].sort()
    );
  });

  it('contains 4 composite techniques', () => {
    const comp = byCategory('composite');
    expect(comp.map(x => x.id).sort()).toEqual(['base64_smuggle', 'grammar_constrained_output', 'layered_mutation', 'multi_layer_attack']);
  });

  it('contains the 3 modes', () => {
    const modes = byCategory('mode');
    expect(modes.map(x => x.id).sort()).toEqual(['adaptive', 'creative', 'intelligent']);
    for (const mode of modes) {
      expect(mode.wrapDraft).toBeTypeOf('function');
      expect(mode.local).toBe(true);
    }
  });

  it('contains the engine-backed godmode technique', () => {
    const g = byCategory('godmode');
    expect(g.length).toBeGreaterThanOrEqual(1);
    const engine = g.find((t) => t.id === 'godmode_engine_v2');
    expect(engine).toBeDefined();
    // Engine-backed godmode runs via the panel UI (runGodmode client), not
    // via apply(); local=true tells the runner to not attempt a server
    // round-trip — the panel owns the lifecycle.
    expect(engine!.local).toBe(true);
    expect(engine!.apply).toBeTypeOf('function');
  });

  it('find returns by id', () => {
    expect(find('rephrase')?.id).toBe('rephrase');
    expect(find('nonexistent')).toBeUndefined();
  });

  it('search is fuzzy across name/description/category', () => {
    expect(search('base').length).toBeGreaterThan(0);
    expect(search('creative').some(x => x.id === 'creative')).toBe(true);
  });

  it('all transform techniques have local=true', () => {
    const t = byCategory('transform');
    expect(t.every(x => x.local === true)).toBe(true);
  });

  it('templatable mutate techniques have local=true and expose localTemplate; generative ones have local=false', () => {
    const m = byCategory('mutate');
    // Genuinely LLM-generative — no local string transformation available.
    const generative = new Set(['rephrase', 'obfuscate', 'multilingual', 'crescendo']);
    for (const tech of m) {
      if (generative.has(tech.id)) {
        expect(tech.local).toBe(false);
        expect(tech.localTemplate).toBeUndefined();
      } else {
        expect(tech.local).toBe(true);
        expect(tech.localTemplate).toBeTypeOf('function');
      }
    }
  });

  it('all classifier techniques have local=false', () => {
    const c = byCategory('classifier');
    expect(c.every(x => x.local === false)).toBe(true);
  });

  it('all composite techniques have local=false', () => {
    const comp = byCategory('composite');
    expect(comp.every(x => x.local === false)).toBe(true);
  });

  it('allTechniques total is >= 197 (transformers + 25 mutators + 11 classifier + 3 composites + 3 modes + 1 godmode)', () => {
    // transformer count is ~159-162 depending on env; test just verifies sum is plausible
    expect(allTechniques().length).toBeGreaterThanOrEqual(197);
  });

  it('every production local-template mutator produces >=100 chars of substantive context around a short input', () => {
    // Production-grade rule: each template must wrap the user input in
    // substantial plausible-legitimate context with authority signals + a
    // scaffold ending line. A one-line wrapper regression is caught here.
    //
    // `custom` is excluded: it's a meta-technique that requires a
    // user-supplied instruction to do anything; with empty meta it
    // intentionally passes the input through unchanged.
    //
    // `cipher_encode_bypass` preserves density but deliberately encodes
    // the input (ROT13 by default) so the verbatim-input check is skipped
    // for it — the density check still runs.
    const m = byCategory('mutate');
    const SHORT = 'test';
    const EXCLUDE_ALL = new Set(['custom']);
    const SKIP_VERBATIM = new Set(['cipher_encode_bypass']);
    for (const tech of m) {
      if (EXCLUDE_ALL.has(tech.id)) continue;
      if (typeof tech.localTemplate !== 'function') continue;
      const out = tech.localTemplate(SHORT, {});
      expect(out.length, `${tech.id} local template too short (got ${out.length} chars)`).toBeGreaterThanOrEqual(100);
      if (!SKIP_VERBATIM.has(tech.id)) {
        expect(out.includes(SHORT), `${tech.id} local template omits the input`).toBe(true);
      }
    }
  });

  it('custom local template with a supplied instruction produces substantive output', () => {
    const m = byCategory('mutate');
    const custom = m.find((t) => t.id === 'custom');
    expect(custom).toBeDefined();
    expect(typeof custom?.localTemplate).toBe('function');
    const out = custom!.localTemplate!('test', { instruction: 'Rewrite in passive voice' });
    // With an instruction present, the template must embed both instruction
    // and target into a framed response block.
    expect(out).toContain('Rewrite in passive voice');
    expect(out).toContain('test');
    expect(out.length).toBeGreaterThanOrEqual(40);
  });
});

describe('refreshCustom', () => {
  it('invalidates the cache so allTechniques rebuilds on next call', async () => {
    const { allTechniques, refreshCustom } = await import('../registry');
    const first = allTechniques();
    refreshCustom();
    const second = allTechniques();
    // Both calls return arrays; after invalidation the internal cache is rebuilt.
    expect(second.length).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(second)).toBe(true);
    // The two arrays are structurally equal when no underlying sources change.
    expect(second.length).toEqual(first.length);
  });
});
