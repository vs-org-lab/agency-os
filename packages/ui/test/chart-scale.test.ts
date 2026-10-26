import { describe, expect, it } from 'vitest';
import { linePath, niceTicks } from '../src/components/charts/chart-scale';

describe('niceTicks', () => {
  it('returns round marks for known ranges', () => {
    expect(niceTicks(0, 1234)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(0, 100)).toEqual([0, 50, 100]);
    expect(niceTicks(0, 9)).toEqual([0, 5, 10]);
  });

  it('covers a degenerate range with a single step', () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });

  it('includes negative values', () => {
    expect(niceTicks(-40, 100)).toEqual([-50, 0, 50, 100]);
  });
});

describe('linePath', () => {
  it('joins consecutive points with line segments', () => {
    expect(
      linePath([
        { x: 0, y: 10 },
        { x: 10, y: 5.5 },
        { x: 20, y: 0 },
      ]),
    ).toBe('M0 10L10 5.5L20 0');
  });

  it('starts a new segment after a gap', () => {
    expect(linePath([{ x: 0, y: 1 }, null, { x: 20, y: 2 }, { x: 30, y: 3 }])).toBe(
      'M0 1M20 2L30 3',
    );
  });
});
