import { describe, expect, it } from 'vitest';
import { canLoseDecisionMaker, canLoseFounder } from './guards';

describe('team guards', () => {
  it('the only founder cannot be removed', () => {
    expect(canLoseFounder(['founder-1'], 'founder-1')).toBe(false);
    expect(canLoseFounder(['founder-1', 'founder-2'], 'founder-1')).toBe(true);
    expect(canLoseFounder(['founder-1'], 'manager-1')).toBe(true);
  });

  it('the only decision maker cannot be removed', () => {
    expect(canLoseDecisionMaker(['dm-1'], 'dm-1')).toBe(false);
    expect(canLoseDecisionMaker(['dm-1', 'dm-2'], 'dm-2')).toBe(true);
  });
});
