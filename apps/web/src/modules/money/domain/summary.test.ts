import { describe, expect, it } from 'vitest';
import { lisbonYear, summarise, yearBounds } from './summary';

describe('summarise', () => {
  it('totals are summed per currency without rounding drift', () => {
    expect(
      summarise({
        received: [
          { amount: '0.10', currency: 'EUR' },
          { amount: '0.20', currency: 'EUR' },
          { amount: '1500', currency: 'GBP' },
        ],
        open: [{ amount: '3000.00', currency: 'EUR' }],
        spent: [],
      }),
    ).toEqual({
      received: { EUR: '0.30', GBP: '1500.00' },
      open: { EUR: '3000.00' },
      spent: {},
    });
  });

  it("the year is Lisbon's", () => {
    expect(lisbonYear(new Date('2026-12-31T23:30:00Z'))).toBe(2026);
    expect(lisbonYear(new Date('2026-12-31T23:30:00-01:00'))).toBe(2027);
    expect(yearBounds(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});
