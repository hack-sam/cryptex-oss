/**
 * SEAL stacked-cipher builder tests · v2.4 SOTA upgrade.
 *
 * Pin: the 18 cipher primitives, layer-stacking order, 3 framing variants,
 * 4 format wraps, entropy meter, and the 12 stack presets.
 */

import { describe, test, expect } from 'vitest';
import {
  buildStackedCipherPayload,
  stackName,
  layerName,
  ALL_LAYERS,
  STACK_PRESETS,
  type CipherLayer
} from '$lib/redteam/stacked-cipher';

describe('buildStackedCipherPayload · core behavior', () => {
  test('empty plaintext returns empty payload + notes', () => {
    const r = buildStackedCipherPayload('', ['rot13']);
    expect(r.encodedPayload).toBe('');
    expect(r.framedPrompt).toBe('');
    expect(r.notes).toMatch(/empty/i);
  });

  test('empty stack returns plaintext unchanged + notes', () => {
    const r = buildStackedCipherPayload('hello', []);
    expect(r.encodedPayload).toBe('hello');
    expect(r.framedPrompt).toBe('');
    expect(r.notes).toMatch(/no cipher layers/i);
  });

  test('framing tells the target to decode outermost-first', () => {
    const r = buildStackedCipherPayload('test goal', ['rot13', 'base64']);
    const i64 = r.framedPrompt.indexOf('Base64');
    const i13 = r.framedPrompt.indexOf('ROT13');
    expect(i64).toBeGreaterThan(-1);
    expect(i13).toBeGreaterThan(-1);
    expect(i64).toBeLessThan(i13);
  });

  test('framing includes encoded payload and a layer count', () => {
    const r = buildStackedCipherPayload('test', ['rot13', 'base64']);
    expect(r.framedPrompt).toContain(r.encodedPayload);
    expect(r.framedPrompt).toMatch(/2 cipher layer/i);
  });

  test('paper citation surfaces in notes', () => {
    const r = buildStackedCipherPayload('test', ['rot13']);
    expect(r.notes).toMatch(/2505\.16241/);
  });

  test('two-layer stack applies innermost first', () => {
    // rot13('hi') = 'uv'; base64('uv') = 'dXY='
    const r = buildStackedCipherPayload('hi', ['rot13', 'base64']);
    expect(r.encodedPayload).toBe('dXY=');
  });
});

describe('cipher primitives · round-trip correctness', () => {
  test('rot13', () => {
    expect(buildStackedCipherPayload('hello', ['rot13']).encodedPayload).toBe('uryyb');
  });
  test('caesar-3', () => {
    expect(buildStackedCipherPayload('abc', ['caesar-3']).encodedPayload).toBe('def');
  });
  test('caesar-7', () => {
    expect(buildStackedCipherPayload('abc', ['caesar-7']).encodedPayload).toBe('hij');
  });
  test('atbash', () => {
    expect(buildStackedCipherPayload('hello', ['atbash']).encodedPayload).toBe('svool');
  });
  test('reverse', () => {
    expect(buildStackedCipherPayload('hello', ['reverse']).encodedPayload).toBe('olleh');
  });
  test('leet', () => {
    expect(buildStackedCipherPayload('letters', ['leet']).encodedPayload).toBe('l3773r5');
  });
  test('base16', () => {
    expect(buildStackedCipherPayload('hi', ['base16']).encodedPayload).toBe('6869');
  });
  test('base32', () => {
    // base32("hi") = "NBUQ===="
    expect(buildStackedCipherPayload('hi', ['base32']).encodedPayload).toBe('NBUQ====');
  });
  test('base64', () => {
    expect(buildStackedCipherPayload('hello', ['base64']).encodedPayload).toBe('aGVsbG8=');
  });
  test('base85 starts/ends with delimiters', () => {
    const r = buildStackedCipherPayload('hi', ['base85']);
    expect(r.encodedPayload.startsWith('<~')).toBe(true);
    expect(r.encodedPayload.endsWith('~>')).toBe(true);
  });
  test('hex (lowercase)', () => {
    expect(buildStackedCipherPayload('hi', ['hex']).encodedPayload).toBe('6869');
  });
  test('polybius encodes h=23, i=24', () => {
    const r = buildStackedCipherPayload('hi', ['polybius']);
    expect(r.encodedPayload).toBe('23 24');
  });
  test('bacon encodes h=AABBB, i=ABAAA', () => {
    const r = buildStackedCipherPayload('hi', ['bacon']);
    expect(r.encodedPayload).toBe('AABBB ABAAA');
  });
  test('morse encodes h=...., i=..', () => {
    const r = buildStackedCipherPayload('hi', ['morse']);
    expect(r.encodedPayload).toBe('.... ..');
  });
  test('a1z26 encodes h=08, i=09', () => {
    const r = buildStackedCipherPayload('hi', ['a1z26']);
    expect(r.encodedPayload).toBe('08-09');
  });
  test('nato encodes h=Hotel, i=India', () => {
    const r = buildStackedCipherPayload('hi', ['nato']);
    expect(r.encodedPayload).toBe('Hotel India');
  });
  test('vigenere with key CRYPTEX shifts the first letter by C(2)', () => {
    // 'a' + key 'C'(shift 2) = 'c'
    expect(buildStackedCipherPayload('a', ['vigenere-CRYPTEX']).encodedPayload).toBe('c');
  });
  test('railfence-3 reorders chars by zigzag rails', () => {
    // 'helloworld' with 3 rails zigzags:
    //   rail 0: h _ _ _ o _ _ _ l _   -> 'hol'
    //   rail 1: _ e _ l _ w _ r _ d   -> 'elwrd'
    //   rail 2: _ _ l _ _ _ o _ _ _   -> 'lo'
    // Concatenated row-major: 'hol' + 'elwrd' + 'lo' = 'holelwrdlo'.
    const r = buildStackedCipherPayload('helloworld', ['railfence-3']);
    expect(r.encodedPayload).toBe('holelwrdlo');
  });
});

describe('framing variants', () => {
  test('decoder-mode framing (default) reads as generic decoder', () => {
    const r = buildStackedCipherPayload('test', ['rot13'], { framing: 'decoder-mode' });
    expect(r.framedPrompt).toMatch(/cipher-decoding assistant/i);
  });
  test('persona framing introduces CipherBot', () => {
    const r = buildStackedCipherPayload('test', ['rot13'], { framing: 'persona' });
    expect(r.framedPrompt).toMatch(/CipherBot/);
  });
  test('puzzle-hint framing includes a worked example', () => {
    const r = buildStackedCipherPayload('test', ['rot13'], { framing: 'puzzle-hint' });
    expect(r.framedPrompt).toMatch(/worked example/i);
    expect(r.framedPrompt).toContain('hello world');
  });
  test('notes record the framing choice', () => {
    const r = buildStackedCipherPayload('test', ['rot13'], { framing: 'persona' });
    expect(r.notes).toMatch(/framing=persona/);
  });
});

describe('format wrap', () => {
  test('none wrap is the raw encoded payload', () => {
    const r = buildStackedCipherPayload('hi', ['rot13'], { wrap: 'none' });
    expect(r.framedPrompt).toContain('uv');
    expect(r.framedPrompt).not.toContain('"encoded":');
  });
  test('json wrap embeds in a JSON object', () => {
    const r = buildStackedCipherPayload('hi', ['rot13'], { wrap: 'json' });
    expect(r.framedPrompt).toContain('"encoded": "uv"');
  });
  test('xml wrap embeds in a <task>/<encoded> element', () => {
    const r = buildStackedCipherPayload('hi', ['rot13'], { wrap: 'xml' });
    expect(r.framedPrompt).toContain('<task>');
    expect(r.framedPrompt).toContain('<encoded>uv</encoded>');
  });
  test('yaml wrap uses block scalar', () => {
    const r = buildStackedCipherPayload('hi', ['rot13'], { wrap: 'yaml' });
    expect(r.framedPrompt).toMatch(/encoded: \|/);
  });
});

describe('entropy meter', () => {
  test('non-zero entropy for non-empty encoded payload', () => {
    const r = buildStackedCipherPayload('this is a longer plaintext', ['base64']);
    expect(r.entropyBitsPerChar).toBeGreaterThan(0);
  });
  test('zero entropy for empty plaintext', () => {
    const r = buildStackedCipherPayload('', ['rot13']);
    expect(r.entropyBitsPerChar).toBe(0);
  });
});

describe('stack presets', () => {
  test('all presets have a non-empty stack of valid layer ids', () => {
    for (const p of STACK_PRESETS) {
      expect(p.stack.length).toBeGreaterThan(0);
      for (const layer of p.stack) {
        expect(ALL_LAYERS).toContain(layer);
      }
    }
  });
  test('each preset produces a non-empty framed prompt on real plaintext', () => {
    for (const p of STACK_PRESETS) {
      const r = buildStackedCipherPayload('some research task', p.stack);
      expect(r.framedPrompt.length).toBeGreaterThan(0);
    }
  });
});

describe('layerName + stackName', () => {
  test('layerName has a label for every layer in ALL_LAYERS', () => {
    for (const l of ALL_LAYERS) {
      expect(layerName(l)).toBeTruthy();
    }
  });
  test('stackName: (none) for empty stack', () => {
    expect(stackName([])).toBe('(none)');
  });
  test('stackName: arrow-separated for non-empty', () => {
    const s: CipherLayer[] = ['rot13', 'base64', 'hex'];
    expect(stackName(s)).toBe('rot13 -> base64 -> hex');
  });
});
