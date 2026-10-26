import { afterEach, describe, expect, it, vi } from 'vitest';

const claims = vi.hoisted(() => vi.fn());
const searchWorkspace = vi.hoisted(() => vi.fn());

vi.mock('@/platform/session', () => ({ getVerifiedClaims: claims }));
vi.mock('@/platform/db', () => ({ withUserContext: vi.fn() }));
vi.mock('./search', () => ({ searchWorkspace }));

import { searchWorkspaceAction } from './actions';

afterEach(() => vi.clearAllMocks());

describe('searchWorkspaceAction', () => {
  it('returns unavailable instead of throwing when the search fails', async () => {
    claims.mockResolvedValue({ sub: 'user' });
    searchWorkspace.mockRejectedValue(new Error('select ... where name ilike $1 failed'));
    await expect(searchWorkspaceAction('atlas')).resolves.toEqual({
      ok: false,
      rule: 'unavailable',
    });
  });

  it('returns forbidden without a verified session', async () => {
    claims.mockResolvedValue(null);
    await expect(searchWorkspaceAction('atlas')).resolves.toEqual({ ok: false, rule: 'forbidden' });
    expect(searchWorkspace).not.toHaveBeenCalled();
  });
});
