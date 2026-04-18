import { describe, it, expect } from 'vitest';
import { GatewayError } from '../types';

describe('types module', () => {
  it('exports GatewayError with category, provider, status fields', () => {
    const e = new GatewayError('boom', { category: 'auth', provider: 'openrouter', status: 401 });
    expect(e.category).toBe('auth');
    expect(e.provider).toBe('openrouter');
    expect(e.status).toBe(401);
    expect(e.message).toBe('boom');
    expect(e).toBeInstanceOf(Error);
  });

  it('carries optional retryAfterMs for rate_limit', () => {
    const e = new GatewayError('slow down', {
      category: 'rate_limit', provider: 'anthropic', retryAfterMs: 4000
    });
    expect(e.retryAfterMs).toBe(4000);
  });
});
