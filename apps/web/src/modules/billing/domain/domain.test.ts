import { describe, expect, it } from 'vitest';
import { formatRequestNumber } from './numbering';
import { buildMilestones, dueDateFrom, fromMinorUnits, lisbonDate } from './plan';
import { reconcileDecision, type ReconcilableRequest } from './reconcile';
import { reminderDue } from './reminders';

describe('buildMilestones', () => {
  it('milestones follow the plan and absorb rounding in the last one', () => {
    const milestones = buildMilestones('1000.00', [
      { label: 'Assinatura', percent: 33 },
      { label: 'Entrega intermédia', percent: 33 },
      { label: 'Entrega final', percent: 34 },
    ]);
    expect(milestones).toEqual([
      { position: 1, label: 'Assinatura', percent: 33, amount: '330.00' },
      { position: 2, label: 'Entrega intermédia', percent: 33, amount: '330.00' },
      { position: 3, label: 'Entrega final', percent: 34, amount: '340.00' },
    ]);
  });

  it('kwanza amounts keep two decimals', () => {
    const milestones = buildMilestones('2500000.01', [
      { label: 'Assinatura', percent: 50 },
      { label: 'Entrega', percent: 50 },
    ]);
    expect(milestones.map((milestone) => milestone.amount)).toEqual(['1250000.00', '1250000.01']);
  });

  it('converts minor units to a decimal string', () => {
    expect(fromMinorUnits(5n)).toBe('0.05');
    expect(fromMinorUnits(123456n)).toBe('1234.56');
  });
});

describe('dates', () => {
  it('reads the calendar date in Lisbon', () => {
    expect(lisbonDate(new Date('2026-10-09T23:30:00Z'))).toBe('2026-10-10');
    expect(lisbonDate(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-15');
  });

  it('first request is due a number of days after it is sent', () => {
    expect(dueDateFrom(new Date('2026-10-09T10:00:00Z'), 7)).toBe('2026-10-16');
    expect(dueDateFrom(new Date('2026-12-28T10:00:00Z'), 7)).toBe('2027-01-04');
  });
});

describe('formatRequestNumber', () => {
  it('numbers are zero padded', () => {
    expect(formatRequestNumber(2026, 1)).toBe('PP-2026-0001');
    expect(formatRequestNumber(2026, 245)).toBe('PP-2026-0245');
    expect(formatRequestNumber(2027, 12345)).toBe('PP-2027-12345');
  });
});

describe('reminderDue', () => {
  const dueDate = '2026-10-20';

  it('stays silent before the first reminder', () => {
    expect(reminderDue({ dueDate, today: '2026-10-16', lastStage: 0 })).toBeNull();
  });

  it('reminder before due fires three days ahead', () => {
    expect(reminderDue({ dueDate, today: '2026-10-17', lastStage: 0 })).toEqual({
      stage: 1,
      kind: 'before',
      daysOverdue: 0,
      alertFounder: false,
    });
  });

  it('fires the overdue reminders on days 1 and 7', () => {
    expect(reminderDue({ dueDate, today: '2026-10-21', lastStage: 1 })).toMatchObject({
      stage: 2,
      kind: 'overdue',
      daysOverdue: 1,
    });
    expect(reminderDue({ dueDate, today: '2026-10-27', lastStage: 2 })).toMatchObject({
      stage: 3,
      daysOverdue: 7,
      alertFounder: false,
    });
  });

  it('only the latest missed reminder fires', () => {
    expect(reminderDue({ dueDate, today: '2026-10-30', lastStage: 0 })).toMatchObject({
      stage: 3,
      kind: 'overdue',
      daysOverdue: 10,
    });
  });

  it('no reminder twice', () => {
    expect(reminderDue({ dueDate, today: '2026-10-18', lastStage: 1 })).toBeNull();
    expect(reminderDue({ dueDate, today: '2026-12-31', lastStage: 5 })).toBeNull();
  });

  it('fifteen and thirty days alert the founder', () => {
    expect(reminderDue({ dueDate, today: '2026-11-04', lastStage: 3 })).toEqual({
      stage: 4,
      kind: 'overdue',
      daysOverdue: 15,
      alertFounder: true,
    });
    expect(reminderDue({ dueDate, today: '2026-11-19', lastStage: 4 })).toEqual({
      stage: 5,
      kind: 'overdue',
      daysOverdue: 30,
      alertFounder: true,
    });
  });
});

describe('reconcileDecision', () => {
  const request: ReconcilableRequest = {
    id: '6f1c2c43-46d4-4d55-9a3e-6c0f9b1d0a11',
    amount: '1250.50',
    currency: 'EUR',
    status: 'sent',
  };

  it('reconciles exact amount and currency', () => {
    expect(
      reconcileDecision(request, { requestId: request.id, amountMinor: 125050n, currency: 'eur' }),
    ).toBe('reconciled');
  });

  it('review on short amount, other currency, unknown or paid request', () => {
    const exact = { requestId: request.id, amountMinor: 125050n, currency: 'EUR' };
    expect(reconcileDecision(request, { ...exact, amountMinor: 125000n })).toBe('review');
    expect(reconcileDecision(request, { ...exact, currency: 'USD' })).toBe('review');
    expect(reconcileDecision(request, { ...exact, requestId: null })).toBe('review');
    expect(reconcileDecision({ ...request, status: 'paid' }, exact)).toBe('review');
    expect(reconcileDecision({ ...request, status: 'void' }, exact)).toBe('review');
  });
});
