import { describe, expect, it } from 'vitest';
import { INNGEST_FUNCTIONS } from './functions';

describe('inngest functions', () => {
  it('serves every module automation including the kickoff tasks', () => {
    const ids = INNGEST_FUNCTIONS.map((fn) => fn.id());

    expect(ids).toEqual(
      expect.arrayContaining([
        expect.stringContaining('outbox'),
        expect.stringContaining('rooms-project-on-kickoff'),
        expect.stringContaining('tasks-kickoff'),
        expect.stringContaining('tasks-assigned-notice'),
        expect.stringContaining('proofing-comment-notice'),
        expect.stringContaining('proofing-rounds-warning'),
        expect.stringContaining('proofing-extra-round'),
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
