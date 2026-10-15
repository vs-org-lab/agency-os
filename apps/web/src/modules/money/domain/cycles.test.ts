import { describe, expect, it } from 'vitest';
import { nextRenewal, renewalState } from './cycles';

describe('subscription cycles', () => {
  it('cycles keep to the last day of short months', () => {
    expect(nextRenewal('2026-10-14', 'monthly')).toBe('2026-11-14');
    expect(nextRenewal('2026-12-15', 'monthly')).toBe('2027-01-15');
    expect(nextRenewal('2027-01-31', 'monthly')).toBe('2027-02-28');
    expect(nextRenewal('2028-01-31', 'monthly')).toBe('2028-02-29');
    expect(nextRenewal('2028-02-29', 'annual')).toBe('2029-02-28');
    expect(nextRenewal('2026-10-14', 'annual')).toBe('2027-10-14');
  });

  it('renewals are overdue, soon or later', () => {
    expect(renewalState('2026-10-13', '2026-10-14')).toBe('overdue');
    expect(renewalState('2026-10-14', '2026-10-14')).toBe('soon');
    expect(renewalState('2026-10-21', '2026-10-14')).toBe('soon');
    expect(renewalState('2026-10-22', '2026-10-14')).toBe('later');
  });
});
