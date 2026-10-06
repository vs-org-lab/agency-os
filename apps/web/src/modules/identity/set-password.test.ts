import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { VerifiedClaims } from '@/platform/db';
import { setPassword, type SetPasswordDeps } from './set-password';

const claims: VerifiedClaims = {
  sub: randomUUID(),
  role: 'authenticated',
  aal: 'aal1',
  session_id: randomUUID(),
  amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) }],
  user_kind: 'internal',
};

function deps(overrides: Partial<SetPasswordDeps> = {}): SetPasswordDeps {
  return {
    updatePassword: vi.fn(async () => ({ ok: true as const })),
    isPwned: vi.fn(async () => false),
    audit: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('setPassword', () => {
  it('set password rejects pwned password', async () => {
    const injected = deps({ isPwned: async () => true });

    expect(await setPassword(claims, { password: 'correct horse battery' }, injected)).toEqual({
      error: 'pwned',
    });
    expect(injected.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects short passwords and unavailable checks without updating', async () => {
    const short = deps();
    expect(await setPassword(claims, { password: 'short' }, short)).toEqual({ error: 'too_short' });

    const unavailable = deps({ isPwned: async () => Promise.reject(new Error('timeout')) });
    expect(await setPassword(claims, { password: 'correct horse battery' }, unavailable)).toEqual({
      error: 'check_unavailable',
    });
    expect(short.updatePassword).not.toHaveBeenCalled();
    expect(unavailable.updatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and audits password.changed', async () => {
    const injected = deps();

    expect(await setPassword(claims, { password: 'correct horse battery' }, injected)).toEqual({
      ok: true,
    });
    expect(injected.updatePassword).toHaveBeenCalledWith('correct horse battery');
    expect(injected.audit).toHaveBeenCalledWith(claims, 'password.changed');
  });

  it('reports provider rejection as update_failed', async () => {
    const injected = deps({ updatePassword: async () => ({ ok: false as const }) });

    expect(await setPassword(claims, { password: 'correct horse battery' }, injected)).toEqual({
      error: 'update_failed',
    });
    expect(injected.audit).not.toHaveBeenCalled();
  });
});
