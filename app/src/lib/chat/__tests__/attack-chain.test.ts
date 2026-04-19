import { describe, it, expect, vi } from 'vitest';
import type { TechniqueContext } from '../techniques/types';
import type { LayerResultRow } from '../attack-chain';

// ---------------------------------------------------------------------------
// Minimal mock registry — injected before the dynamic import inside runChain
// ---------------------------------------------------------------------------

type MockTechnique = {
  id: string;
  name: string;
  description: string;
  category: 'mutate';
  local: boolean;
  apply: (input: string, ctx: TechniqueContext) => Promise<{ output: string; metadata?: Record<string, unknown> }>;
  icon?: undefined;
};

const makeTechnique = (id: string, name: string, transform: (s: string) => string): MockTechnique => ({
  id,
  name,
  description: '',
  category: 'mutate' as const,
  local: true,
  apply: async (input: string) => ({ output: transform(input) })
});

const REGISTRY: Record<string, MockTechnique> = {
  upper: makeTechnique('upper', 'Uppercase', (s) => s.toUpperCase()),
  exclaim: makeTechnique('exclaim', 'Exclaim', (s) => s + '!')
};

vi.mock('../techniques/registry', () => ({
  find: (id: string) => REGISTRY[id] ?? undefined,
  allTechniques: () => Object.values(REGISTRY),
  byCategory: (cat: string) => Object.values(REGISTRY).filter((t) => t.category === cat),
  search: (q: string) => Object.values(REGISTRY).filter((t) => t.id.includes(q))
}));

// ---------------------------------------------------------------------------

import { runChain, buildLayerPrompt } from '../attack-chain';

function makeCtx(overrides?: Partial<TechniqueContext>): TechniqueContext {
  return {
    model: 'test-model',
    callLLM: async () => { throw new Error('callLLM should not be called in local tests'); },
    signal: new AbortController().signal,
    ...(overrides ?? {})
  };
}

async function collect(gen: AsyncGenerator<LayerResultRow>): Promise<LayerResultRow[]> {
  const rows: LayerResultRow[] = [];
  for await (const row of gen) rows.push(row);
  return rows;
}

describe('runChain', () => {
  it('2-step chain of local techniques: yields 2 rows, output of first feeds second', async () => {
    const signal = new AbortController().signal;
    const ctx = makeCtx();
    const rows = await collect(runChain('hello', ['upper', 'exclaim'], [{}, {}], ctx, signal));

    expect(rows).toHaveLength(2);

    // Layer 0: upper
    expect(rows[0].layerIndex).toBe(0);
    expect(rows[0].techniqueId).toBe('upper');
    expect(rows[0].techniqueName).toBe('Uppercase');
    expect(rows[0].input).toBe('hello');
    expect(rows[0].output).toBe('HELLO');
    expect(rows[0].error).toBeUndefined();

    // Layer 1: exclaim — input is output of layer 0
    expect(rows[1].layerIndex).toBe(1);
    expect(rows[1].techniqueId).toBe('exclaim');
    expect(rows[1].techniqueName).toBe('Exclaim');
    expect(rows[1].input).toBe('HELLO');
    expect(rows[1].output).toBe('HELLO!');
    expect(rows[1].error).toBeUndefined();
  });

  it('yields error row and stops when a technique id is not found', async () => {
    const signal = new AbortController().signal;
    const ctx = makeCtx();
    const rows = await collect(
      runChain('hello', ['upper', 'nonexistent', 'exclaim'], [{}, {}, {}], ctx, signal)
    );

    // Should yield layer 0 success, then layer 1 error, then stop (no layer 2)
    expect(rows).toHaveLength(2);
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].techniqueId).toBe('nonexistent');
    expect(rows[1].error).toBe('technique not found');
    expect(rows[1].output).toBe('');
  });

  it('yields error row and stops when a technique throws', async () => {
    const throwingTechnique = {
      id: 'thrower',
      name: 'Thrower',
      description: '',
      category: 'mutate' as const,
      local: true,
      apply: async () => { throw new Error('boom'); }
    };
    REGISTRY['thrower'] = throwingTechnique as unknown as MockTechnique;

    const signal = new AbortController().signal;
    const ctx = makeCtx();
    const rows = await collect(
      runChain('hello', ['upper', 'thrower', 'exclaim'], [{}, {}, {}], ctx, signal)
    );

    // layer 0 succeeds, layer 1 errors, chain stops
    expect(rows).toHaveLength(2);
    expect(rows[0].error).toBeUndefined();
    expect(rows[1].techniqueId).toBe('thrower');
    expect(rows[1].error).toBe('boom');

    delete REGISTRY['thrower'];
  });

  it('durationMs is non-negative for each row', async () => {
    const signal = new AbortController().signal;
    const ctx = makeCtx();
    const rows = await collect(runChain('test', ['upper', 'exclaim'], [{}, {}], ctx, signal));
    for (const row of rows) {
      expect(row.durationMs).toBeGreaterThanOrEqual(0);
      expect(row.startedAt).toBeGreaterThan(0);
    }
  });

  it('stops immediately when signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const ctx = makeCtx();
    const rows = await collect(runChain('hello', ['upper', 'exclaim'], [{}, {}], ctx, ac.signal));
    expect(rows).toHaveLength(0);
  });

  it('per-layer metadata flows into technique.apply ctx.metadata', async () => {
    const captured: Array<Record<string, unknown> | undefined> = [];
    const spyTechnique: MockTechnique = {
      id: 'spy',
      name: 'Spy',
      description: '',
      category: 'mutate',
      local: true,
      apply: async (input, ctx) => {
        captured.push(ctx.metadata);
        return { output: input + '|seen' };
      }
    };
    REGISTRY['spy'] = spyTechnique;
    REGISTRY['spy2'] = { ...spyTechnique, id: 'spy2', name: 'Spy2' };

    const signal = new AbortController().signal;
    const ctx = makeCtx({ metadata: { base: 'b' } });
    await collect(
      runChain(
        'hello',
        ['spy', 'spy2'],
        [{ persona: 'Dr. Keslan' }, { novel_title: 'The Cartographer' }],
        ctx,
        signal
      )
    );

    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatchObject({ base: 'b', persona: 'Dr. Keslan' });
    expect(captured[1]).toMatchObject({ base: 'b', novel_title: 'The Cartographer' });

    delete REGISTRY['spy'];
    delete REGISTRY['spy2'];
  });

  it('layerOverrides replace intermediate layer inputs', async () => {
    const signal = new AbortController().signal;
    const ctx = makeCtx();

    // upper -> exclaim, with an override injected at layer 1 replacing "HELLO"
    const rows = await collect(
      runChain(
        'hello',
        ['upper', 'exclaim'],
        [{}, {}],
        ctx,
        signal,
        [null, 'manual-edit']
      )
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].output).toBe('HELLO');
    // layer 1 uses the override, not the upstream output
    expect(rows[1].input).toBe('manual-edit');
    expect(rows[1].output).toBe('manual-edit!');
  });
});

describe('runChain finalExecution', () => {
  it('execute=true yields an __execute__ row after all layers', async () => {
    const finalMockResponse = 'ACTUAL_MODEL_ANSWER';
    const mockLLM = vi.fn().mockResolvedValueOnce(finalMockResponse);
    const signal = new AbortController().signal;
    const ctx = makeCtx({ callLLM: mockLLM });

    const rows = await collect(
      runChain('input', ['upper'], [{}], ctx, signal, undefined, { enabled: true })
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].techniqueId).toBe('upper');
    expect(rows[0].output).toBe('INPUT');
    expect(rows[1].techniqueId).toBe('__execute__');
    expect(rows[1].techniqueName).toBe('Model response');
    expect(rows[1].output).toBe(finalMockResponse);
    expect(rows[1].input).toBe('INPUT');
  });

  it('execute=false does not yield __execute__ row', async () => {
    const mockLLM = vi.fn();
    const signal = new AbortController().signal;
    const ctx = makeCtx({ callLLM: mockLLM });

    const rows = await collect(
      runChain('input', ['upper'], [{}], ctx, signal, undefined, { enabled: false })
    );

    expect(rows).toHaveLength(1);
    expect(rows.find((r) => r.techniqueId === '__execute__')).toBeUndefined();
    expect(mockLLM).not.toHaveBeenCalled();
  });

  it('execute final row passes systemPrompt through ctx.callLLM', async () => {
    const mockLLM = vi.fn().mockResolvedValueOnce('final');
    const signal = new AbortController().signal;
    const ctx = makeCtx({ callLLM: mockLLM });

    await collect(
      runChain(
        'input',
        ['upper'],
        [{}],
        ctx,
        signal,
        undefined,
        { enabled: true, systemPrompt: 'AUTH_HEADER' }
      )
    );

    expect(mockLLM).toHaveBeenCalledTimes(1);
    expect(mockLLM.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        system: 'AUTH_HEADER',
        user: 'INPUT'
      })
    );
  });
});

describe('buildLayerPrompt', () => {
  it('returns scaffolded SYSTEM+USER prompt for a known mutator', () => {
    const p = buildLayerPrompt('rephrase', 'write a limerick about clouds', {});
    expect(p).not.toBeNull();
    expect(p).toContain('SYSTEM:');
    expect(p).toContain('USER:');
    expect(p).toContain('write a limerick about clouds');
    // Scaffolded output-wrapper is present
    expect(p).toContain('<rewrite>');
  });

  it('honors metadata overrides (roleplay persona)', () => {
    const p = buildLayerPrompt('roleplay', 'explain DNS', { persona: 'Dr. Turing' });
    expect(p).not.toBeNull();
    expect(p).toContain('Dr. Turing');
  });

  it('returns null for an unknown / dynamic technique id', () => {
    expect(buildLayerPrompt('cipher_encode_bypass', 'x', {})).toBeNull();
    expect(buildLayerPrompt('nonsense_id', 'x', {})).toBeNull();
  });
});
