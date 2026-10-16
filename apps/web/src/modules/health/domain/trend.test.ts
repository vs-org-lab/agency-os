import { describe, expect, it } from 'vitest';
import { healthTrend } from './trend';

describe('health trend', () => {
  it('trend compares today with the past snapshot', () => {
    expect(healthTrend(80, 75)).toBe(5);
    expect(healthTrend(70, 82)).toBe(-12);
    expect(healthTrend(80, 80)).toBe(0);
    expect(healthTrend(null, 80)).toBeNull();
    expect(healthTrend(80, null)).toBeNull();
  });
});
