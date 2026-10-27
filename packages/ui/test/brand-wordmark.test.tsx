// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandWordmark } from '../src/brand/wordmark';

afterEach(cleanup);

describe('BrandWordmark', () => {
  it('is an image named by its title', () => {
    render(<BrandWordmark title="Aurion" />);

    expect(screen.getByRole('img', { name: 'Aurion' })).toBeTruthy();
  });

  it('is decorative without a title', () => {
    const { container } = render(<BrandWordmark />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('draws the letters in the current colour and the dot in gold', () => {
    const { container } = render(<BrandWordmark />);

    expect(container.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
    expect(container.querySelector('[data-slot="wordmark-dot"]')?.getAttribute('fill')).toBe(
      'var(--gold)',
    );
  });
});
