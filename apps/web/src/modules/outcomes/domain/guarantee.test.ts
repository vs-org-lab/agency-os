import { describe, expect, it } from 'vitest';
import { direction, evaluateAtDeadline, reachesTarget, targetReachedBy } from './guarantee';
import { fullMonthsSince } from './months';

const UP = { baseline: 40, target: 60 };
const DOWN = { baseline: 20, target: 10 };

describe('outcome guarantee', () => {
  it('targets are reached in either direction, including exactly', () => {
    expect(direction(40, 60)).toBe('up');
    expect(direction(20, 10)).toBe('down');
    expect(reachesTarget(UP, 60)).toBe(true);
    expect(reachesTarget(UP, 59)).toBe(false);
    expect(reachesTarget(UP, 75)).toBe(true);
    expect(reachesTarget(DOWN, 10)).toBe(true);
    expect(reachesTarget(DOWN, 11)).toBe(false);
    expect(reachesTarget(DOWN, 8)).toBe(true);
  });

  it('only values up to the deadline decide the guarantee', () => {
    const values = [
      { measuredOn: '2026-09-01', value: 50 },
      { measuredOn: '2026-12-02', value: 61 },
    ];
    expect(targetReachedBy(UP, values, '2026-12-01')).toBe(false);
    expect(targetReachedBy(UP, values, '2026-12-02')).toBe(true);
    expect(targetReachedBy(UP, [], '2026-12-01')).toBe(false);
  });

  it('the deadline evaluation follows the spec order', () => {
    expect(evaluateAtDeadline({ targetReached: true, conditions: ['failed', 'pending'] })).toEqual({
      status: 'not_activated',
      reason: 'target_met',
    });
    expect(evaluateAtDeadline({ targetReached: false, conditions: ['failed', 'pending'] })).toEqual(
      { status: 'not_activated', reason: 'conditions_failed' },
    );
    expect(evaluateAtDeadline({ targetReached: false, conditions: ['met', 'pending'] })).toEqual({
      status: 'pending',
    });
    expect(evaluateAtDeadline({ targetReached: false, conditions: ['met', 'met', 'met'] })).toEqual(
      { status: 'active' },
    );
  });

  it('full months since activation, capped at 3', () => {
    expect(fullMonthsSince('2026-01-31', '2026-02-27')).toBe(0);
    expect(fullMonthsSince('2026-01-31', '2026-02-28')).toBe(1);
    expect(fullMonthsSince('2026-01-15', '2026-02-14')).toBe(0);
    expect(fullMonthsSince('2026-01-15', '2026-02-15')).toBe(1);
    expect(fullMonthsSince('2026-01-15', '2026-05-20')).toBe(3);
    expect(fullMonthsSince('2026-01-15', '2026-01-15')).toBe(0);
  });
});
