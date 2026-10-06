import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { VerifiedClaims } from '@/platform/db';
import type { AuthPort, IdentityDeps } from './auth-port';
import { requestMagicLink } from './magic-link';
import { enrollTotp, verifyTotp } from './mfa';
import { requireRecentMfa } from './reauth';
import { signInWithPassword } from './sign-in';

const USER = randomUUID();
const SESSION = randomUUID();

function claims(overrides: Partial<VerifiedClaims> = {}): VerifiedClaims {
  return {
    sub: USER,
    role: 'authenticated',
    aal: 'aal1',
    session_id: SESSION,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: 'internal',
    ...overrides,
  };
}

type FakeOptions = {
  signInError?: boolean;
  claims?: VerifiedClaims | null;
  claimsAfterVerify?: VerifiedClaims;
  verifiedFactors?: number;
  unverifiedFactors?: number;
  verifyError?: boolean;
};

function fakeDeps(options: FakeOptions = {}) {
  let verified = false;
  const auth = {
    signInWithPassword: vi.fn(async () =>
      options.signInError
        ? { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }
        : { data: {}, error: null },
    ),
    signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
    getClaims: vi.fn(async () => {
      const current =
        verified && options.claimsAfterVerify ? options.claimsAfterVerify : options.claims;
      return current === null
        ? { data: null, error: { message: 'no session' } }
        : { data: { claims: current ?? claims() }, error: null };
    }),
    signOut: vi.fn(async () => ({ error: null })),
    mfa: {
      listFactors: vi.fn(async () => ({
        data: {
          all: [
            ...Array.from({ length: options.verifiedFactors ?? 0 }, (_, index) => ({
              id: `verified-${index}`,
              factor_type: 'totp',
              status: 'verified',
            })),
            ...Array.from({ length: options.unverifiedFactors ?? 0 }, (_, index) => ({
              id: `unverified-${index}`,
              factor_type: 'totp',
              status: 'unverified',
            })),
          ],
        },
        error: null,
      })),
      enroll: vi.fn(async () => ({
        data: {
          id: 'factor-1',
          type: 'totp',
          totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRET' },
        },
        error: null,
      })),
      unenroll: vi.fn(async () => ({ data: {}, error: null })),
      challengeAndVerify: vi.fn(async () => {
        if (options.verifyError)
          return { data: null, error: { message: 'Invalid TOTP code entered' } };
        verified = true;
        return { data: {}, error: null };
      }),
    },
  };

  const deps: IdentityDeps = {
    auth: auth as unknown as AuthPort,
    lookupUserKind: vi.fn(async (email: string) =>
      email === 'team@agency.example'
        ? ('internal' as const)
        : email === 'client@company.example'
          ? ('client' as const)
          : null,
    ),
    audit: vi.fn(async () => undefined),
    activateInvitations: vi.fn(async () => undefined),
    startActivity: vi.fn(async () => undefined),
    magicLinkRedirectUrl: 'https://app.example/callback',
  };

  return { auth, deps };
}

describe('signInWithPassword', () => {
  it('wrong password returns invalid_credentials without revealing account existence', async () => {
    const { deps } = fakeDeps({ signInError: true });

    expect(
      await signInWithPassword({ email: 'team@agency.example', password: 'wrong' }, deps),
    ).toEqual({
      error: 'invalid_credentials',
    });
    expect(
      await signInWithPassword({ email: 'nobody@nowhere.example', password: 'wrong' }, deps),
    ).toEqual({
      error: 'invalid_credentials',
    });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it('internal user without factor is sent to enrollment', async () => {
    const { deps } = fakeDeps({ verifiedFactors: 0 });

    expect(
      await signInWithPassword({ email: 'team@agency.example', password: 'pw' }, deps),
    ).toEqual({
      next: 'mfa_enroll',
    });
    expect(deps.startActivity).toHaveBeenCalledWith(SESSION);
  });

  it('user with a verified factor is sent to verification', async () => {
    const { deps } = fakeDeps({ verifiedFactors: 1 });

    expect(
      await signInWithPassword({ email: 'team@agency.example', password: 'pw' }, deps),
    ).toEqual({
      next: 'mfa_verify',
    });
  });

  it('client without factor completes sign-in and starts no activity timer', async () => {
    const { deps } = fakeDeps({ claims: claims({ user_kind: 'client' }) });

    expect(
      await signInWithPassword({ email: 'client@company.example', password: 'pw' }, deps),
    ).toEqual({
      next: 'done',
    });
    expect(deps.startActivity).not.toHaveBeenCalled();
  });

  it('activates pending invitations before auditing the sign-in', async () => {
    const { deps } = fakeDeps({ verifiedFactors: 1 });

    await signInWithPassword({ email: 'team@agency.example', password: 'pw' }, deps);

    expect(deps.activateInvitations).toHaveBeenCalledWith(expect.objectContaining({ sub: USER }));
    const activation = vi.mocked(deps.activateInvitations).mock.invocationCallOrder[0] ?? 0;
    const audit = vi.mocked(deps.audit).mock.invocationCallOrder[0] ?? 0;
    expect(activation).toBeLessThan(audit);
  });

  it('normalises the email before signing in', async () => {
    const { auth, deps } = fakeDeps();

    await signInWithPassword({ email: '  Team@Agency.Example ', password: 'pw' }, deps);

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'team@agency.example',
      password: 'pw',
    });
  });
});

describe('requestMagicLink', () => {
  it('magic link is not sent to internal email but response is identical', async () => {
    const internal = fakeDeps();
    const client = fakeDeps();
    const unknown = fakeDeps();

    const responses = [
      await requestMagicLink({ email: 'team@agency.example' }, internal.deps),
      await requestMagicLink({ email: 'client@company.example' }, client.deps),
      await requestMagicLink({ email: 'nobody@nowhere.example' }, unknown.deps),
    ];

    expect(responses).toEqual([{ sent: true }, { sent: true }, { sent: true }]);
    expect(internal.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(unknown.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'client@company.example',
      options: { shouldCreateUser: false, emailRedirectTo: 'https://app.example/callback' },
    });
  });

  it('normalises email before internal check', async () => {
    const { auth, deps } = fakeDeps();

    await requestMagicLink({ email: ' TEAM@agency.EXAMPLE ' }, deps);

    expect(deps.lookupUserKind).toHaveBeenCalledWith('team@agency.example');
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('still answers sent when the provider fails', async () => {
    const { auth, deps } = fakeDeps();
    auth.signInWithOtp.mockRejectedValueOnce(new Error('rate limited'));

    expect(await requestMagicLink({ email: 'client@company.example' }, deps)).toEqual({
      sent: true,
    });
  });
});

describe('totp', () => {
  it('enrolment removes stale unverified factors and returns the qr code and secret', async () => {
    const { auth, deps } = fakeDeps({ unverifiedFactors: 2 });

    expect(await enrollTotp(deps)).toEqual({
      factorId: 'factor-1',
      qrCode: 'data:image/svg+xml;utf-8,<svg/>',
      secret: 'SECRET',
    });
    expect(auth.mfa.unenroll).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed codes without contacting the provider', async () => {
    const { auth, deps } = fakeDeps();

    expect(
      await verifyTotp({ factorId: 'factor-1', code: '12a456', mode: 'verify' }, deps),
    ).toEqual({
      error: 'invalid_code',
    });
    expect(auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('sign in, mfa failure and enrollment are audited', async () => {
    const signIn = fakeDeps();
    await signInWithPassword({ email: 'team@agency.example', password: 'pw' }, signIn.deps);
    expect(signIn.deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ sub: USER }),
      'auth.sign_in',
    );

    const failure = fakeDeps({ verifyError: true });
    expect(
      await verifyTotp({ factorId: 'factor-1', code: '123456', mode: 'verify' }, failure.deps),
    ).toEqual({
      error: 'invalid_code',
    });
    expect(failure.deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ sub: USER }),
      'auth.mfa_failed',
    );

    const enrolment = fakeDeps({ claimsAfterVerify: claims({ aal: 'aal2' }) });
    expect(
      await verifyTotp({ factorId: 'factor-1', code: '123456', mode: 'enroll' }, enrolment.deps),
    ).toEqual({
      ok: true,
    });
    expect(enrolment.deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ aal: 'aal2' }),
      'auth.mfa_enrolled',
    );
    expect(enrolment.deps.startActivity).toHaveBeenCalledWith(SESSION);
  });
});

describe('requireRecentMfa', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');
  const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

  it('requireRecentMfa accepts totp at 14m59s and rejects at 15m01s', () => {
    const recent = claims({
      aal: 'aal2',
      amr: [{ method: 'totp', timestamp: seconds(now) - (14 * 60 + 59) }],
    });
    const stale = claims({
      aal: 'aal2',
      amr: [{ method: 'totp', timestamp: seconds(now) - (15 * 60 + 1) }],
    });

    expect(requireRecentMfa(recent, now)).toEqual({ ok: true });
    expect(requireRecentMfa(stale, now)).toEqual({
      ok: false,
      reason: 'reauthentication_required',
    });
  });

  it('requireRecentMfa rejects when amr has no totp', () => {
    expect(requireRecentMfa(claims({ aal: 'aal2' }), now)).toEqual({
      ok: false,
      reason: 'reauthentication_required',
    });
  });

  it('uses the most recent totp entry', () => {
    const mixed = claims({
      aal: 'aal2',
      amr: [
        { method: 'totp', timestamp: seconds(now) - 3600 },
        { method: 'totp', timestamp: seconds(now) - 60 },
      ],
    });

    expect(requireRecentMfa(mixed, now)).toEqual({ ok: true });
  });
});
