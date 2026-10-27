// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StackedBars } from '../src/components/charts/stacked-bars';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

afterEach(cleanup);

const segmentLabels = { open: 'Abertas', done: 'Concluídas' };

function renderBars(rows: React.ComponentProps<typeof StackedBars>['rows']) {
  installMatchMedia(false);
  return render(
    <MotionProvider>
      <StackedBars
        rows={rows}
        segmentLabels={segmentLabels}
        formatValue={(value) => `${value} tarefas`}
        summary="Carga da equipa"
      />
    </MotionProvider>,
  );
}

describe('StackedBars', () => {
  it('segment widths are proportional to the largest row', () => {
    const { container } = renderBars([
      {
        key: 'ana',
        label: 'Ana',
        segments: [
          { key: 'open', value: 6 },
          { key: 'done', value: 2 },
        ],
      },
      {
        key: 'rui',
        label: 'Rui',
        segments: [
          { key: 'open', value: 2 },
          { key: 'done', value: 2 },
        ],
      },
    ]);
    const widths = (rowKey: string) =>
      [...container.querySelectorAll(`[data-row="${rowKey}"] [data-segment]`)].map((node) =>
        node.getAttribute('data-width'),
      );

    expect(widths('ana')).toEqual(['75', '25']);
    expect(widths('rui')).toEqual(['25', '25']);
  });

  it('legend lists segments', () => {
    const { container } = renderBars([
      { key: 'ana', label: 'Ana', segments: [{ key: 'open', value: 1 }] },
    ]);
    const legend = container.querySelector('[data-slot="legend"]') as HTMLElement;

    expect(within(legend).getByText('Abertas')).toBeTruthy();
    expect(within(legend).getByText('Concluídas')).toBeTruthy();
  });

  it('zero rows render an empty bar', () => {
    const { container } = renderBars([
      { key: 'ana', label: 'Ana', segments: [{ key: 'open', value: 0 }] },
      { key: 'rui', label: 'Rui', segments: [] },
    ]);

    expect(container.querySelectorAll('[data-segment]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-slot="bar-track"]')).toHaveLength(2);
    expect(screen.getAllByText('0 tarefas')).toHaveLength(2);
  });
});

describe('StackedBars without legend entries', () => {
  it('colours unlisted segments by position and names them on hover', () => {
    installMatchMedia(false);
    const { container } = render(
      <MotionProvider>
        <StackedBars
          rows={[
            {
              key: 'core',
              label: 'Core',
              segments: [
                { key: '1.1', value: 1, label: '1.1' },
                { key: '1.2', value: 3, label: '1.2' },
              ],
            },
          ]}
          segmentLabels={{}}
          formatValue={String}
          summary="Negócios"
        />
      </MotionProvider>,
    );
    const segments = [...container.querySelectorAll<HTMLElement>('[data-segment]')];

    expect(segments.map((node) => node.style.backgroundColor)).toEqual([
      'var(--chart-1)',
      'var(--chart-2)',
    ]);
    expect(segments[1]?.getAttribute('title')).toBe('1.2: 3');
    expect(container.querySelector('[data-slot="legend"]')).toBeNull();
  });
});
