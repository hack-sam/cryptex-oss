import { describe, it, expect } from 'vitest';
import { translateError } from '../errors';
import { GatewayError } from '../types';

describe('translateError', () => {
  it('passes GatewayError through unchanged', () => {
    const e = new GatewayError('x', { category: 'auth', provider: 'openrouter' });
    expect(translateError(e, 'openrouter')).toBe(e);
  });

  it('maps AbortError (DOMException) to its own error with aborted-ish category', () => {
    const abort = new DOMException('aborted', 'AbortError');
    // AbortError should re-throw via the caller; translateError should not swallow it
    expect(() => translateError(abort, 'openrouter')).toThrow();
  });

  it('maps 401-shaped SDK error to category auth', () => {
    const e = { status: 401, message: 'invalid_api_key' } as const;
    const result = translateError(e, 'anthropic');
    expect(result.category).toBe('auth');
    expect(result.provider).toBe('anthropic');
  });

  it('maps 429 with Retry-After seconds to rate_limit with retryAfterMs', () => {
    const e = { status: 429, message: 'rate_limited', headers: { 'retry-after': '7' } } as const;
    const result = translateError(e, 'openrouter');
    expect(result.category).toBe('rate_limit');
    expect(result.retryAfterMs).toBe(7000);
  });

  it('maps TypeError ("Failed to fetch") to cors when host is anthropic', () => {
    const e = new TypeError('Failed to fetch');
    const result = translateError(e, 'anthropic', { suspectCors: true });
    expect(result.category).toBe('cors');
  });

  it('defaults to unknown when shape is unrecognized', () => {
    const result = translateError({ weird: true }, 'openrouter');
    expect(result.category).toBe('unknown');
  });

  it('maps 502/503/504 to server_unavailable', () => {
    for (const status of [502, 503, 504]) {
      const result = translateError({ status, message: `HTTP ${status}` }, 'openrouter');
      expect(result.category).toBe('server_unavailable');
      expect(result.status).toBe(status);
    }
  });
});
