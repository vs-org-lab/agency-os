import { describe, expect, it } from 'vitest';
import { outcomeProgress } from './progress-summary';

describe('outcome progress', () => {
  it('measures the way from the baseline to the target, within 0 and 100', () => {
    expect(outcomeProgress(100, 200, 150)).toBe(50);
    expect(outcomeProgress(100, 200, 250)).toBe(100);
    expect(outcomeProgress(100, 200, 80)).toBe(0);
    expect(outcomeProgress(50, 10, 30)).toBe(50);
    expect(outcomeProgress(100, 200, null)).toBe(0);
  });
});
