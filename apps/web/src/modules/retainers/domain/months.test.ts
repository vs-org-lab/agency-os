import { describe, expect, it } from 'vitest';
import { monthProgress } from './months';

describe('monthProgress', () => {
  it('counts the days elapsed and left in the Lisbon month', () => {
    expect(monthProgress(new Date('2026-10-26T12:00:00Z'))).toEqual({
      day: 26,
      total: 31,
      left: 5,
    });
  });

  it('uses the Lisbon date around midnight', () => {
    // 23:30 UTC on 30 June is already 1 July in Lisbon (UTC+1).
    expect(monthProgress(new Date('2026-06-30T23:30:00Z'))).toEqual({
      day: 1,
      total: 31,
      left: 30,
    });
  });

  it('knows the length of February and reports zero left on the last day', () => {
    expect(monthProgress(new Date('2028-02-29T12:00:00Z'))).toEqual({
      day: 29,
      total: 29,
      left: 0,
    });
  });
});
