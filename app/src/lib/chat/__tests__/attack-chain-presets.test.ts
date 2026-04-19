import { describe, it, expect } from 'vitest';
import { PRESETS } from '../attack-chain-presets';
import { find } from '../techniques/registry';

describe('Attack Chain presets', () => {
  it('every preset has a non-empty id, name, description, and at least 2 layers', () => {
    for (const p of PRESETS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.layers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every preset layer id resolves via registry.find()', () => {
    for (const p of PRESETS) {
      for (const id of p.layers) {
        const t = find(id);
        expect(t, `preset ${p.id} references unknown technique: ${id}`).toBeDefined();
      }
    }
  });

  it('exposes exactly the 3 expected presets', () => {
    const ids = PRESETS.map((p) => p.id).sort();
    expect(ids).toEqual(['code_extraction', 'data_exfiltration', 'policy_bypass']);
  });
});
