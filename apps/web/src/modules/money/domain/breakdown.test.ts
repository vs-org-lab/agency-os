import { describe, expect, it } from 'vitest';
import { openByAge, receivedByClient, type BreakdownRequest } from './breakdown';

const request = (overrides: Partial<BreakdownRequest>): BreakdownRequest => ({
  clientName: 'Bloom',
  amount: '1000.00',
  currency: 'EUR',
  status: 'sent',
  sentAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

describe('openByAge', () => {
  it('groups the open requests by days since they were sent', () => {
    const buckets = openByAge(
      [
        request({ sentAt: '2026-10-20T10:00:00.000Z' }),
        request({ sentAt: '2026-09-10T10:00:00.000Z', amount: '500.00' }),
        request({ sentAt: '2026-06-01T10:00:00.000Z', currency: 'AOA', amount: '90000.00' }),
        request({ status: 'paid' }),
        request({ status: 'void' }),
      ],
      '2026-10-27',
    );

    expect(buckets).toEqual([
      { id: 'current', count: 1, totals: { EUR: '1000.00' } },
      { id: 'late', count: 1, totals: { EUR: '500.00' } },
      { id: 'overdue', count: 0, totals: {} },
      { id: 'stale', count: 1, totals: { AOA: '90000.00' } },
    ]);
  });
});

describe('receivedByClient', () => {
  it('totals the paid requests per client, largest first', () => {
    expect(
      receivedByClient([
        request({ status: 'paid', clientName: 'Bloom', amount: '1000.00' }),
        request({ status: 'paid', clientName: 'Norte', amount: '4000.00' }),
        request({ status: 'paid', clientName: 'Bloom', amount: '500.00' }),
        request({ status: 'sent', clientName: 'Sul', amount: '9000.00' }),
      ]),
    ).toEqual([
      { clientName: 'Norte', totals: { EUR: '4000.00' }, share: 1 },
      { clientName: 'Bloom', totals: { EUR: '1500.00' }, share: 0.375 },
    ]);
  });
});
