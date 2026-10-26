// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SkeletonCards,
  SkeletonHeader,
  SkeletonPanel,
  SkeletonRows,
} from '../src/components/states/skeletons';

afterEach(cleanup);

describe('skeletons', () => {
  it.each([
    ['header', <SkeletonHeader key="h" label="Loading" />],
    ['rows', <SkeletonRows key="r" label="Loading" />],
    ['cards', <SkeletonCards key="c" label="Loading" />],
    ['panel', <SkeletonPanel key="p" label="Loading" />],
  ])('each skeleton announces loading: %s', (_name, element) => {
    render(element);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toContain('Loading');
  });

  it('rows renders the requested count', () => {
    const { container } = render(<SkeletonRows label="Loading" rows={4} columns={3} />);

    expect(container.querySelectorAll('[data-slot="skeleton-row"]')).toHaveLength(4);
    expect(
      container.querySelectorAll('[data-slot="skeleton-row"]:first-child [data-slot="skeleton"]'),
    ).toHaveLength(3);
  });
});
