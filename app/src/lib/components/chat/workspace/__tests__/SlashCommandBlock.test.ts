import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SlashCommandBlock from '../SlashCommandBlock.svelte';

describe('SlashCommandBlock', () => {
  it('renders rawInput as the primary line', () => {
    const { getByText } = render(SlashCommandBlock, {
      title: 'Rephrase',
      slashId: 'rephrase',
      rawInput: '/rephrase hello world',
      rewrite: 'Hello, world!'
    });
    expect(getByText('/rephrase hello world')).toBeTruthy();
  });

  it('renders collapsible summary with title and slash id', () => {
    const { container } = render(SlashCommandBlock, {
      title: 'CVE reproduction',
      slashId: 'cve_reproduction',
      rawInput: '/cve_reproduction CVE-2022-1234',
      rewrite: 'Mutated output here'
    });
    const summary = container.querySelector('summary');
    expect(summary).toBeTruthy();
    expect(summary!.textContent).toContain('/cve_reproduction');
    expect(summary!.textContent).toContain('CVE reproduction');
  });

  it('renders rewrite inside <pre> body', () => {
    const rewrite = 'long mutated\n  multi-line payload\nend';
    const { container } = render(SlashCommandBlock, {
      title: 'Payload split',
      slashId: 'payload_split',
      rawInput: '/payload_split test',
      rewrite
    });
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toBe(rewrite);
  });
});
