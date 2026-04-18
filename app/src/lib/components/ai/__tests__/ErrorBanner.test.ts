import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ErrorBanner from '../ErrorBanner.svelte';
import { GatewayError } from '$lib/ai/types';

describe('ErrorBanner', () => {
  it('renders auth error with Open Settings CTA', () => {
    const err = new GatewayError('bad key', { category: 'auth', provider: 'openrouter' });
    const { getByText } = render(ErrorBanner, { error: err });
    expect(getByText(/key isn't working/i)).toBeTruthy();
    expect(getByText(/Open Settings/i)).toBeTruthy();
  });

  it('renders rate_limit with retry countdown', () => {
    const err = new GatewayError('slow', { category: 'rate_limit', provider: 'anthropic', retryAfterMs: 4000 });
    const { getByText } = render(ErrorBanner, { error: err });
    expect(getByText(/Rate limited/i)).toBeTruthy();
    expect(getByText(/retry in 4s/i)).toBeTruthy();
  });

  it('renders cors with Learn why CTA', () => {
    const err = new GatewayError("can't reach", { category: 'cors', provider: 'openai-compat' });
    const { getByText } = render(ErrorBanner, { error: err });
    expect(getByText(/Learn why/i)).toBeTruthy();
  });
});
