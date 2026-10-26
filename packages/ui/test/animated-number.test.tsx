// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnimatedNumber } from '../src/components/animated-number';
import { accessibleNumberText } from './number-flow';
import { installMatchMedia } from './match-media';

afterEach(cleanup);

describe('AnimatedNumber', () => {
  it('formats with the locale', () => {
    installMatchMedia(false);
    const expected = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
      .format(1234.5)
      .replace(/\s/g, ' ');

    const { container } = render(
      <AnimatedNumber
        value={1234.5}
        locale="pt-PT"
        format={{ style: 'currency', currency: 'EUR' }}
      />,
    );

    expect(accessibleNumberText(container)).toBe(expected);
  });

  it('animates by default', () => {
    installMatchMedia(false);

    const { container } = render(<AnimatedNumber value={5} locale="en" />);

    expect(
      container.querySelector<HTMLElement & { animated?: boolean }>('number-flow-react')?.animated,
    ).toBe(true);
  });
});
