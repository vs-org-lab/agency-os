// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LineChart } from '../src/components/charts/line-chart';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

// Kept in its own file: motion caches the reduced-motion preference per module instance.
describe('LineChart with reduced motion', () => {
  it('reduced motion renders the full line', () => {
    installMatchMedia(true);

    const { container } = render(
      <MotionProvider>
        <LineChart
          series={[{ key: 'a', label: 'A', values: [1, 2, 3] }]}
          labels={['jan', 'fev', 'mar']}
          formatValue={String}
          summary="Resumo"
        />
      </MotionProvider>,
    );
    const path = container.querySelector('path[data-series="a"]');

    expect(path?.getAttribute('d')).toBeTruthy();
    expect(path?.getAttribute('pathLength')).toBeNull();
    expect(path?.getAttribute('style') ?? '').not.toContain('stroke-dash');
  });
});
