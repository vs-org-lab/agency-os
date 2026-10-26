// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { TimelineRow } from '@/modules/rooms';
import { TimelineView } from './timeline-view';

afterEach(cleanup);

const row = (id: string, label: string, overrides: Partial<TimelineRow> = {}): TimelineRow => ({
  id,
  label,
  start: '2026-10-01',
  end: '2026-10-10',
  tone: 'pending',
  ...overrides,
});

function renderView(rows: TimelineRow[], undated: string[]) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <TimelineView rows={rows} undated={undated} today="2026-10-15" />
    </NextIntlClientProvider>,
  );
}

describe('TimelineView', () => {
  it('draws dated phases and notes the ones left out', () => {
    renderView(
      [
        row('a', 'Descoberta', { tone: 'done' }),
        row('b', 'Design', { tone: 'active', start: '2026-10-10', end: '2026-10-28' }),
      ],
      ['Entrega'],
    );
    expect(screen.getAllByRole('row').length).toBe(2);
    expect(screen.getByText('Sem datas e fora do cronograma: Entrega.')).toBeTruthy();
  });

  it('explains when no phase has dates', () => {
    renderView([], ['Descoberta']);
    expect(screen.queryByRole('grid')).toBeNull();
    expect(
      screen.getByText('Ainda não há datas nas fases para desenhar o cronograma.'),
    ).toBeTruthy();
  });
});
