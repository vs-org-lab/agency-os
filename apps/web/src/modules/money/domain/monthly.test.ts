import { describe, expect, it } from 'vitest';
import { filterByRange, monthlyTotals, parseRange, rangePresets } from './monthly';

const request = (
  id: string,
  sentAt: string,
  amount: string,
  currency = 'EUR',
  status = 'paid',
) => ({
  id,
  sentAt,
  amount,
  currency: currency as 'EUR' | 'USD',
  status: status as 'sent' | 'paid' | 'void',
});
const expense = (id: string, spentOn: string, amount: string, currency = 'EUR') => ({
  id,
  spentOn,
  amount,
  currency: currency as 'EUR' | 'USD',
});

describe('monthlyTotals', () => {
  it('monthly totals group by Lisbon month in EUR', () => {
    const totals = monthlyTotals(
      [
        request('a', '2026-03-10T10:00:00.000Z', '100.10'),
        request('b', '2026-03-31T23:30:00.000Z', '50.00'),
        request('c', '2026-12-31T23:30:00.000Z', '10.00'),
        request('d', '2026-05-02T10:00:00.000Z', '75.00', 'USD'),
        request('e', '2026-05-03T10:00:00.000Z', '20.00', 'EUR', 'sent'),
        request('f', '2026-06-03T10:00:00.000Z', '20.00', 'EUR', 'void'),
      ],
      [
        expense('x', '2026-03-05', '20.20'),
        expense('y', '2026-11-30', '9.99'),
        expense('z', '2026-04-01', '5.00', 'USD'),
      ],
    );

    // 2026-03-31T23:30Z is 00:30 on 1 April in Lisbon (summer time).
    expect(totals.received).toEqual([0, 0, 100.1, 50, 0, 0, 0, 0, 0, 0, 0, 10]);
    expect(totals.spent).toEqual([0, 0, 20.2, 0, 0, 0, 0, 0, 0, 0, 9.99, 0]);
    expect(totals.otherCurrencies).toBe(true);
  });

  it('reports no other currencies when everything is EUR', () => {
    expect(monthlyTotals([], [expense('x', '2026-03-05', '1.00')]).otherCurrencies).toBe(false);
  });
});

describe('filterByRange', () => {
  const requests = [
    request('in', '2026-10-15T10:00:00.000Z', '1.00'),
    request('edge', '2026-09-30T23:30:00.000Z', '1.00'),
    request('out', '2026-09-30T10:00:00.000Z', '1.00'),
  ];
  const expenses = [expense('in', '2026-10-01', '1.00'), expense('out', '2026-11-01', '1.00')];

  it('range filters requests and expenses', () => {
    const range = { from: '2026-10-01', to: '2026-10-31' };
    const filtered = filterByRange(requests, expenses, range);

    expect(filtered.requests.map((row) => row.id)).toEqual(['in', 'edge']);
    expect(filtered.expenses.map((row) => row.id)).toEqual(['in']);
  });

  it('keeps everything without a range', () => {
    const filtered = filterByRange(requests, expenses, null);

    expect(filtered.requests).toHaveLength(3);
    expect(filtered.expenses).toHaveLength(2);
  });
});

describe('parseRange', () => {
  it('accepts an ordered range inside the year', () => {
    expect(parseRange('2026-02-01', '2026-02-28', 2026)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('invalid range is ignored', () => {
    for (const [from, to] of [
      ['2026-02-30', '2026-03-01'],
      ['2026-03-02', '2026-03-01'],
      ['2025-12-31', '2026-01-05'],
      ['2026-12-01', '2027-01-01'],
      ['2026-02-01', undefined],
      [undefined, undefined],
      ['yesterday', 'today'],
    ] as const) {
      expect(parseRange(from, to, 2026), `${from} ${to}`).toBeNull();
    }
  });
});

describe('rangePresets', () => {
  it('offers this month, the last quarter and this year inside the viewed year', () => {
    expect(rangePresets('2026-10-26', 2026)).toEqual([
      { id: 'month', from: '2026-10-01', to: '2026-10-31' },
      { id: 'quarter', from: '2026-07-01', to: '2026-09-30' },
      { id: 'year', from: '2026-01-01', to: '2026-12-31' },
    ]);
  });

  it('drops presets that fall outside the viewed year', () => {
    expect(rangePresets('2026-02-10', 2026).map((preset) => preset.id)).toEqual(['month', 'year']);
    expect(rangePresets('2026-10-26', 2025)).toEqual([
      { id: 'year', from: '2025-01-01', to: '2025-12-31' },
    ]);
  });
});
