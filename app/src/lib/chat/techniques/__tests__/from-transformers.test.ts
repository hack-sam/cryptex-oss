import { describe, it, expect } from 'vitest';
import { transformerTechniques } from '../from-transformers';
import { allTransformers } from '$lib/transformers/registry';

/**
 * Regression coverage for the auto-registration glue that turns the 162
 * transformers in `src/transformers/` into `Technique` objects consumed by
 * the chat composer's SelectionPopover and the slash-command system.
 *
 * Without this, a refactor in `from-transformers.ts` (e.g., accidentally
 * passing the wrong arg shape to `t.func()` or losing the `local: true` flag)
 * would silently break every transformer-driven feature.
 */
describe('transformerTechniques', () => {
  it('exports one technique per registered transformer', () => {
    const techniques = transformerTechniques();
    expect(techniques.length).toBe(allTransformers.length);
    // Sanity floor — drops a tripwire if the registry stops loading.
    expect(techniques.length).toBeGreaterThan(100);
  });

  it('marks every transformer-technique as local + category=transform', () => {
    const techniques = transformerTechniques();
    expect(techniques.every((t) => t.local === true)).toBe(true);
    expect(techniques.every((t) => t.category === 'transform')).toBe(true);
  });

  it('produces unique slug ids', () => {
    const techniques = transformerTechniques();
    const ids = new Set(techniques.map((t) => t.id));
    expect(ids.size).toBe(techniques.length);
  });

  it('apply() output matches the underlying transformer.func() (ROT13)', async () => {
    const techniques = transformerTechniques();
    const tech = techniques.find(
      (t) => t.name.toLowerCase() === 'rot13' || t.id === 'rot13'
    );
    expect(tech, 'expected a ROT13 transformer-technique').toBeDefined();
    const transformer = allTransformers.find((t) => t.name === tech!.name);
    expect(transformer, 'expected matching transformer in registry').toBeDefined();

    const input = 'Hello, world!';
    const expected = transformer!.func(input);
    const result = await tech!.apply(input, {
      originalInput: input,
      callLLM: async () => ''
    });
    expect(result.output).toBe(expected);
    expect(result.metadata?.error).toBeUndefined();
  });

  it('apply() never throws — errors are captured into metadata.error', async () => {
    // Running every transformer on an arbitrary input should never propagate
    // a throw out of apply(). The catch-block in from-transformers.ts is the
    // contract that protects callers (SelectionPopover, slash dispatch) from
    // a misbehaving transformer crashing the chat surface.
    const techniques = transformerTechniques();
    for (const t of techniques) {
      const result = await t.apply('test input 123', {
        originalInput: 'test input 123',
        callLLM: async () => ''
      });
      expect(result).toHaveProperty('output');
      expect(typeof result.output).toBe('string');
    }
  });
});
