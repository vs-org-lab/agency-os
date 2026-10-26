// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LineChart } from '../src/components/charts/line-chart';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

afterEach(cleanup);

const labels = ['jan', 'fev', 'mar'];
const series = [
  { key: 'received', label: 'Recebido', values: [0, 50, 100] },
  { key: 'expenses', label: 'Despesas', values: [10, null, 20] },
];

function renderChart() {
  installMatchMedia(false);
  return render(
    <MotionProvider>
      <LineChart
        series={series}
        labels={labels}
        formatValue={(value) => `${value} €`}
        summary="Recebido e despesas por mês"
      />
    </MotionProvider>,
  );
}

describe('LineChart', () => {
  it('draws path points for known data and breaks the line at a missing value', () => {
    const { container } = renderChart();

    expect(container.querySelector('path[data-series="received"]')?.getAttribute('d')).toBe(
      'M56 212L340 114L624 16',
    );
    expect(container.querySelector('path[data-series="expenses"]')?.getAttribute('d')).toBe(
      'M56 192.4M624 172.8',
    );
  });

  it('labels the graphic with the summary and lists the series in the legend', () => {
    renderChart();

    expect(screen.getByRole('img', { name: 'Recebido e despesas por mês' })).toBeTruthy();
    expect(screen.getByText('Recebido')).toBeTruthy();
    expect(screen.getByText('Despesas')).toBeTruthy();
  });

  it('draws round axis marks', () => {
    const { container } = renderChart();
    const ticks = [...container.querySelectorAll('[data-slot="y-tick"]')].map((node) =>
      node.textContent?.trim(),
    );

    expect(ticks).toEqual(['0 €', '50 €', '100 €']);
  });

  it('arrow keys move the active point', () => {
    renderChart();
    const chart = screen.getByRole('img', { name: 'Recebido e despesas por mês' });

    chart.focus();
    expect(screen.queryByRole('status')?.textContent ?? '').toBe('');

    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toContain('jan');
    expect(screen.getByRole('status').textContent).toContain('0 €');

    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toContain('fev');
    expect(screen.getByRole('status').textContent).toContain('50 €');

    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(screen.getByRole('status').textContent).toContain('jan');

    fireEvent.keyDown(chart, { key: 'Escape' });
    expect(screen.queryByRole('status')?.textContent ?? '').toBe('');
  });
});
