import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { VerifiedClaims } from '@/platform/db';
import { changePassword } from './sessions';

const claims: VerifiedClaims = {
  sub: randomUUID(),
  role: 'authenticated',
  aal: 'aal2',
  session_id: randomUUID(),
  amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
};

describe('changePassword', () => {
  it('changing password ends all sessions and audits password.changed', async () => {
    const deps = {
      updatePassword: vi.fn(async () => ({ ok: true })),
      isPwned: vi.fn(async () => false),
      audit: vi.fn(async () => undefined),
      signOutEverywhere: vi.fn(async () => undefined),
    };

    expect(await changePassword(claims, { password: 'correct horse battery' }, deps)).toEqual({
      ok: true,
    });
    expect(deps.audit).toHaveBeenCalledWith(claims, 'password.changed');
    expect(deps.signOutEverywhere).toHaveBeenCalledTimes(1);
    expect(deps.audit.mock.invocationCallOrder[0]).toBeLessThan(
      deps.signOutEverywhere.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('keeps sessions when the new password is rejected', async () => {
    const deps = {
      updatePassword: vi.fn(async () => ({ ok: true })),
      isPwned: vi.fn(async () => true),
      audit: vi.fn(async () => undefined),
      signOutEverywhere: vi.fn(async () => undefined),
    };

    expect(await changePassword(claims, { password: 'correct horse battery' }, deps)).toEqual({
      error: 'pwned',
    });
    expect(deps.signOutEverywhere).not.toHaveBeenCalled();
  });
});
