import { describe, expect, it } from 'vitest';
import { assessSubmission } from './bot-checks';

const NOW = new Date('2026-10-07T12:00:00Z');

describe('assessSubmission', () => {
  it('flags a filled honeypot', () => {
    expect(
      assessSubmission({
        honeypot: '+351 210 000 000',
        startedAt: NOW.getTime() - 60_000,
        now: NOW,
      }),
    ).toBe('honeypot');
  });

  it('flags submissions under 3 seconds', () => {
    expect(assessSubmission({ honeypot: '', startedAt: NOW.getTime() - 2_999, now: NOW })).toBe(
      'too_fast',
    );
  });

  it('flags a start time in the future', () => {
    expect(assessSubmission({ honeypot: '', startedAt: NOW.getTime() + 10_000, now: NOW })).toBe(
      'too_fast',
    );
  });

  it('accepts a normal submission', () => {
    expect(assessSubmission({ honeypot: '', startedAt: NOW.getTime() - 3_000, now: NOW })).toBe(
      'human',
    );
  });
});
