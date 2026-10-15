import { describe, expect, it } from 'vitest';
import { renewalsDue } from './anniversaries';
import { healthScore } from './score';
import {
  approvalsSignal,
  median,
  outcomeSignal,
  paymentsSignal,
  responsesSignal,
  type Signal,
} from './signals';

const OPEN = { status: 'pending' as const, reason: null };

describe('health signals', () => {
  it('payments on time share, open overdue requests count as late', () => {
    expect(paymentsSignal([])).toBeNull();
    expect(
      paymentsSignal([
        { dueDate: '2026-09-10', paidOn: '2026-09-10' },
        { dueDate: '2026-09-20', paidOn: '2026-09-12' },
        { dueDate: '2026-09-30', paidOn: '2026-10-02' },
        { dueDate: '2026-10-05', paidOn: null },
      ]),
    ).toEqual({ score: 50, detail: { kind: 'payments', onTime: 2, total: 4 } });
  });

  it('approval and response scales are linear between their limits', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(approvalsSignal([])).toBeNull();
    expect(approvalsSignal([2, 3])?.score).toBe(100);
    expect(approvalsSignal([8.5])).toEqual({
      score: 50,
      detail: { kind: 'approvals', medianDays: 8.5 },
    });
    expect(approvalsSignal([14, 20])?.score).toBe(0);
    expect(responsesSignal([24])?.score).toBe(100);
    expect(responsesSignal([96])).toEqual({
      score: 50,
      detail: { kind: 'responses', medianHours: 96 },
    });
    expect(responsesSignal([168])?.score).toBe(0);
  });

  it('outcome progress works in either direction and never goes below zero', () => {
    const base = {
      createdOn: '2026-01-01',
      deadline: '2026-12-31',
      today: '2026-07-02',
      guarantee: OPEN,
    };
    expect(outcomeSignal({ ...base, baseline: 40, target: 60, latest: null })).toBeNull();
    const up = outcomeSignal({ ...base, baseline: 40, target: 60, latest: 50 });
    expect(up?.detail).toMatchObject({ kind: 'outcome', progress: 0.5 });
    expect(up?.score).toBe(100);
    const behind = outcomeSignal({ ...base, baseline: 40, target: 60, latest: 44 });
    expect(behind?.score).toBe(40);
    const down = outcomeSignal({ ...base, baseline: 20, target: 10, latest: 15 });
    expect(down?.detail).toMatchObject({ progress: 0.5 });
    const worse = outcomeSignal({ ...base, baseline: 20, target: 10, latest: 25 });
    expect(worse).toMatchObject({ score: 0, detail: { progress: 0 } });
    expect(
      outcomeSignal({ ...base, today: '2026-01-01', baseline: 40, target: 60, latest: 40 })?.score,
    ).toBe(100);
    expect(
      outcomeSignal({
        ...base,
        today: '2027-03-01',
        baseline: 40,
        target: 60,
        latest: 45,
        guarantee: { status: 'not_activated', reason: 'target_met' },
      })?.score,
    ).toBe(100);
  });

  it('the score averages the signals with data', () => {
    const signal = (score: number): Signal => ({
      score,
      detail: { kind: 'approvals', medianDays: 1 },
    });
    expect(healthScore([null, null])).toEqual({ score: null, level: null });
    expect(healthScore([signal(80), null, signal(71)])).toEqual({ score: 76, level: 'healthy' });
    expect(healthScore([signal(75)]).level).toBe('healthy');
    expect(healthScore([signal(74)]).level).toBe('attention');
    expect(healthScore([signal(50)]).level).toBe('attention');
    expect(healthScore([signal(49)]).level).toBe('at_risk');
  });
});

describe('renewal anniversaries', () => {
  it('anniversaries in the last 7 days, 29 February on the 28th', () => {
    expect(renewalsDue('2025-10-15', '2025-10-15')).toEqual([]);
    expect(renewalsDue('2025-10-15', '2026-10-15')).toEqual([{ year: 1, on: '2026-10-15' }]);
    expect(renewalsDue('2025-10-15', '2026-10-21')).toEqual([{ year: 1, on: '2026-10-15' }]);
    expect(renewalsDue('2025-10-15', '2026-10-22')).toEqual([]);
    expect(renewalsDue('2025-10-15', '2026-10-14')).toEqual([]);
    expect(renewalsDue('2024-02-29', '2025-02-28')).toEqual([{ year: 1, on: '2025-02-28' }]);
    expect(renewalsDue('2024-02-29', '2028-02-29')).toEqual([{ year: 4, on: '2028-02-29' }]);
    expect(renewalsDue('2023-12-30', '2025-01-02')).toEqual([{ year: 1, on: '2024-12-30' }]);
    expect(renewalsDue('2023-12-30', '2026-01-02')).toEqual([{ year: 2, on: '2025-12-30' }]);
    expect(renewalsDue('2023-01-03', '2026-01-02')).toEqual([]);
  });
});
