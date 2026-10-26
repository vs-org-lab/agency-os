// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ganttLayout, TimelineGantt } from '../src/components/timeline-gantt';

afterEach(cleanup);

const ROWS = [
  { id: 'a', label: 'Descoberta', start: '2026-10-05', end: '2026-10-11', tone: 'done' as const },
  { id: 'b', label: 'Design', start: '2026-10-12', end: '2026-10-25', tone: 'active' as const },
];

describe('ganttLayout', () => {
  it('places bars proportionally over the span of the rows', () => {
    const layout = ganttLayout(ROWS, '2026-10-15', 'week');
    expect(layout.totalDays).toBe(21);
    expect(layout.bars[0]!.leftPct).toBeCloseTo(0);
    expect(layout.bars[0]!.widthPct).toBeCloseTo((7 / 21) * 100);
    expect(layout.bars[1]!.leftPct).toBeCloseTo((7 / 21) * 100);
    expect(layout.bars[1]!.widthPct).toBeCloseTo((14 / 21) * 100);
    expect(layout.todayPct).toBeCloseTo((10 / 21) * 100);
  });

  it('extends the range so that today is always inside it', () => {
    const layout = ganttLayout(ROWS, '2026-10-01', 'week');
    expect(layout.totalDays).toBe(25);
    expect(layout.todayPct).toBeCloseTo(0);
    expect(layout.bars[0]!.leftPct).toBeCloseTo((4 / 25) * 100);
  });

  it('is wider in the month zoom than in the week zoom', () => {
    expect(ganttLayout(ROWS, '2026-10-15', 'week').pxPerDay).toBeGreaterThan(
      ganttLayout(ROWS, '2026-10-15', 'month').pxPerDay,
    );
  });
});

function renderGantt(rows = ROWS) {
  return render(
    <TimelineGantt
      rows={rows}
      today="2026-10-15"
      locale="pt-PT"
      label="Cronograma"
      todayLabel="Hoje"
      zoomLabel="Escala"
      zoomWeekLabel="Semana"
      zoomMonthLabel="Mês"
      rowLabel={(row) => `${row.label}, de ${row.start} a ${row.end}`}
    />,
  );
}

describe('TimelineGantt', () => {
  it('renders one labelled row per phase and the today line', () => {
    const { container } = renderGantt();
    expect(screen.getAllByRole('row').length).toBe(2);
    expect(screen.getByRole('row', { name: 'Design, de 2026-10-12 a 2026-10-25' })).toBeTruthy();
    expect(container.querySelector('[data-slot="gantt-today"]')).not.toBeNull();
  });

  it('switches zoom without losing the rows', async () => {
    const user = userEvent.setup();
    const { container } = renderGantt();
    const root = container.querySelector('[data-slot="timeline-gantt"]');
    expect(root?.getAttribute('data-zoom')).toBe('week');
    await user.click(screen.getByRole('button', { name: 'Mês' }));
    expect(root?.getAttribute('data-zoom')).toBe('month');
    expect(screen.getByRole('button', { name: 'Mês' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('row').length).toBe(2);
  });

  it('moves between rows with the arrow keys', async () => {
    const user = userEvent.setup();
    renderGantt();
    const [first, second] = screen.getAllByRole('row');
    first!.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(second);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(first);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(second);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(first);
  });

  it('renders nothing for an empty timeline', () => {
    const { container } = renderGantt([]);
    expect(container.querySelector('[data-slot="timeline-gantt"]')).toBeNull();
  });
});
