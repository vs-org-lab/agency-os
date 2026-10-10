import { describe, expect, it } from 'vitest';
import { canTakeTask } from './people';

describe('canTakeTask', () => {
  const founder = { id: 'f', name: 'Fundadora', clientIds: null };
  const freelancer = { id: 'l', name: 'Freelancer', clientIds: ['client-a'] };

  it('founders take tasks of any client and staff only of their clients', () => {
    expect(canTakeTask(founder, 'client-b')).toBe(true);
    expect(canTakeTask(freelancer, 'client-a')).toBe(true);
    expect(canTakeTask(freelancer, 'client-b')).toBe(false);
  });

  it('everyone may take a studio task', () => {
    expect(canTakeTask(freelancer, null)).toBe(true);
  });
});
