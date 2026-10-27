import { describe, expect, it } from 'vitest';
import { formatKpi, kpiChange, kpiStanding } from './kpi-format';

describe('formatKpi', () => {
  it('formats numbers, percentages, currency and ratios for the reader', () => {
    expect(formatKpi(12410, 'number', 'pt-PT')).toBe('12 410');
    expect(formatKpi(3.8, 'percent', 'pt-PT')).toBe('3,8%');
    expect(formatKpi(4500, 'currency', 'pt-PT')).toBe('4500 €');
    expect(formatKpi(4.2, 'ratio', 'pt-PT')).toBe('4,2×');
    expect(formatKpi(1234.5, 'number', 'en')).toBe('1,234.5');
  });
});

describe('kpiChange', () => {
  it('gives the relative change for counts and the point change for percentages', () => {
    expect(kpiChange(124, 100, 'number')).toEqual({ direction: 'up', amount: 24, unit: 'percent' });
    expect(kpiChange(3.8, 3.2, 'percent')).toEqual({
      direction: 'up',
      amount: 0.6,
      unit: 'points',
    });
    expect(kpiChange(4.2, 4.5, 'ratio')).toEqual({ direction: 'down', amount: 0.3, unit: 'value' });
    expect(kpiChange(10, null, 'number')).toBeNull();
    expect(kpiChange(10, 0, 'number')).toBeNull();
  });
});

describe('kpiStanding', () => {
  it('says whether the target is met or how close the value is', () => {
    expect(kpiStanding(12410, 12000)).toEqual({ met: true, share: 1 });
    expect(kpiStanding(142, 160)).toEqual({ met: false, share: 0.89 });
    expect(kpiStanding(142, null)).toBeNull();
  });
});
