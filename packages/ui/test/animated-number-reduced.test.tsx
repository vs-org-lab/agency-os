// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnimatedNumber } from '../src/components/animated-number';
import { installMatchMedia } from './match-media';

// Kept in its own file: motion caches the reduced-motion preference per module instance.
describe('AnimatedNumber with reduced motion', () => {
  it('does not animate with reduced motion', () => {
    installMatchMedia(true);

    const { container } = render(<AnimatedNumber value={5} locale="en" />);

    expect(
      container.querySelector<HTMLElement & { animated?: boolean }>('number-flow-react')?.animated,
    ).toBe(false);
  });
});
