import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SignInWall from '../SignInWall.svelte';

describe('SignInWall', () => {
  it('renders sign-in options with default feature label', () => {
    const { getByText } = render(SignInWall, {});
    expect(getByText(/Sign in to use this feature/i)).toBeTruthy();
    expect(getByText(/Continue with Google/i)).toBeTruthy();
    expect(getByText(/Continue with GitHub/i)).toBeTruthy();
  });

  it('uses custom feature label when provided', () => {
    const { getByText } = render(SignInWall, { feature: 'Chat' });
    expect(getByText(/Sign in to use Chat/i)).toBeTruthy();
  });
});
