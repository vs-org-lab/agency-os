import { describe, expect, it } from 'vitest';
import { allowance, crossedThresholds, limitState } from './allowance';
import { firstOfMonth, lisbonMonth, previousMonth } from './months';

describe('retainer allowance', () => {
  it('the first month has no carry', () => {
    expect(allowance({ limit: 4, usedLastMonth: 0, firstMonth: true })).toEqual({
      carry: 0,
      available: 4,
    });
  });

  it('at most 20% of the limit carries over', () => {
    expect(allowance({ limit: 10, usedLastMonth: 0, firstMonth: false })).toEqual({
      carry: 2,
      available: 12,
    });
    expect(allowance({ limit: 10, usedLastMonth: 9, firstMonth: false })).toEqual({
      carry: 1,
      available: 11,
    });
  });

  it('an exhausted month carries nothing', () => {
    expect(allowance({ limit: 4, usedLastMonth: 4, firstMonth: false }).carry).toBe(0);
    expect(allowance({ limit: 4, usedLastMonth: 6, firstMonth: false }).carry).toBe(0);
  });

  it('extra work does not count against the limit or the carry', () => {
    // The caller passes only the usage counted against the limit; extra work is excluded.
    expect(allowance({ limit: 4, usedLastMonth: 3, firstMonth: false })).toEqual({
      carry: 0.8,
      available: 4.8,
    });
  });

  it('hours keep one decimal', () => {
    expect(allowance({ limit: 7.5, usedLastMonth: 7.2, firstMonth: false })).toEqual({
      carry: 0.3,
      available: 7.8,
    });
    expect(limitState({ limit: 7.5, carry: 0.3, used: 2.25 })).toEqual({
      available: 7.8,
      used: 2.3,
      remaining: 5.5,
      percent: 29,
    });
  });

  it('thresholds crossed by one entry', () => {
    expect(crossedThresholds(7, 8.5, 10)).toEqual([80]);
    expect(crossedThresholds(7, 10.5, 10)).toEqual([80, 100]);
    expect(crossedThresholds(8.5, 9, 10)).toEqual([]);
    expect(crossedThresholds(9, 10, 10)).toEqual([100]);
  });
});

describe('retainer months', () => {
  it('months are the first day in Lisbon', () => {
    expect(firstOfMonth('2026-10-15')).toBe('2026-10-01');
    expect(previousMonth('2026-01-01')).toBe('2025-12-01');
    expect(previousMonth('2026-10-01')).toBe('2026-09-01');
    expect(lisbonMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10-01');
    expect(lisbonMonth(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10-01');
  });
});
