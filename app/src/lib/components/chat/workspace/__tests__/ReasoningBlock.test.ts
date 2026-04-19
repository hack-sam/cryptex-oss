import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ReasoningBlock from '../ReasoningBlock.svelte';

describe('ReasoningBlock', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true
    });
  });

  it('renders the copy button when not live and text is present', () => {
    const { getByLabelText } = render(ReasoningBlock, { text: 'hello reasoning', live: false });
    const btn = getByLabelText('Copy reasoning');
    expect(btn).toBeTruthy();
  });

  it('clicking the copy button calls navigator.clipboard.writeText with the reasoning text', async () => {
    const text = 'step one\nstep two\nfinal answer';
    const { getByLabelText } = render(ReasoningBlock, { text, live: false });
    const btn = getByLabelText('Copy reasoning');
    await fireEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text);
  });
});
