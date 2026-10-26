import { describe, expect, it } from 'vitest';
import { phaseTimeline } from './timeline';

const phase = (
  id: string,
  overrides: Partial<Parameters<typeof phaseTimeline>[0][number]> = {},
): Parameters<typeof phaseTimeline>[0][number] => ({
  id,
  name: id,
  status: 'pending',
  startedAt: null,
  completedAt: null,
  dueOn: null,
  steps: [],
  ...overrides,
});

describe('phaseTimeline', () => {
  it('uses real start and completion over due dates', () => {
    const { rows } = phaseTimeline(
      [
        phase('a', {
          status: 'done',
          startedAt: '2026-10-05T09:00:00.000Z',
          completedAt: '2026-10-09T17:00:00.000Z',
          dueOn: '2026-10-12',
        }),
      ],
      '2026-10-01',
    );
    expect(rows).toEqual([
      { id: 'a', label: 'a', start: '2026-10-05', end: '2026-10-09', tone: 'done' },
    ]);
  });

  it('starts a phase where the previous one ends and ends it at its due date', () => {
    const { rows } = phaseTimeline(
      [
        phase('a', { status: 'done', startedAt: '2026-10-05T09:00:00.000Z', dueOn: '2026-10-09' }),
        phase('b', { status: 'in_progress', dueOn: '2026-10-23' }),
      ],
      '2026-10-01',
    );
    expect(rows.map((row) => [row.id, row.start, row.end, row.tone])).toEqual([
      ['a', '2026-10-05', '2026-10-09', 'done'],
      ['b', '2026-10-09', '2026-10-23', 'active'],
    ]);
  });

  it('falls back to the latest step due date and the project start', () => {
    const { rows } = phaseTimeline(
      [phase('a', { steps: [{ dueOn: '2026-10-08' }, { dueOn: '2026-10-14' }, { dueOn: null }] })],
      '2026-10-01',
    );
    expect(rows.map((row) => [row.start, row.end])).toEqual([['2026-10-01', '2026-10-14']]);
  });

  it('leaves out phases without any date and reports them', () => {
    const result = phaseTimeline(
      [phase('a', { dueOn: '2026-10-10' }), phase('b'), phase('c')],
      '2026-10-01',
    );
    expect(result.rows.map((row) => row.id)).toEqual(['a']);
    expect(result.undated).toEqual(['b', 'c']);
  });

  it('never ends before it starts', () => {
    const { rows } = phaseTimeline(
      [phase('a', { startedAt: '2026-11-02T09:00:00.000Z', dueOn: '2026-10-20' })],
      '2026-10-01',
    );
    expect(rows[0]).toMatchObject({ start: '2026-11-02', end: '2026-11-02' });
  });
});
