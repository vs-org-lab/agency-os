import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { VerifiedClaims } from '@/platform/db';
import { accountActionAllowed } from './account-assurance';

function claims(overrides: Partial<VerifiedClaims>): VerifiedClaims {
  return {
    sub: randomUUID(),
    role: 'authenticated',
    aal: 'aal1',
    session_id: randomUUID(),
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: 'internal',
    ...overrides,
  };
}

describe('accountActionAllowed', () => {
  it('rejects internal users with a verified factor who have not completed mfa', () => {
    expect(accountActionAllowed(claims({ aal: 'aal1' }), { hasVerifiedFactor: true })).toBe(false);
  });

  it('allows internal users after mfa', () => {
    expect(accountActionAllowed(claims({ aal: 'aal2' }), { hasVerifiedFactor: true })).toBe(true);
  });

  it('allows invited internal users without any factor to set their first password', () => {
    expect(accountActionAllowed(claims({ aal: 'aal1' }), { hasVerifiedFactor: false })).toBe(true);
  });

  it('allows client users at aal1 unless they enrolled a factor', () => {
    expect(
      accountActionAllowed(claims({ user_kind: 'client' }), { hasVerifiedFactor: false }),
    ).toBe(true);
    expect(accountActionAllowed(claims({ user_kind: 'client' }), { hasVerifiedFactor: true })).toBe(
      false,
    );
  });
});
