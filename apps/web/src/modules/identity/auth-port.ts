import type { SupabaseClient } from '@supabase/supabase-js';
import { verifiedClaimsSchema, type VerifiedClaims } from '@/platform/db';
import type { AuditAction } from '@/modules/audit';

type SupabaseAuth = SupabaseClient['auth'];

export type AuthPort = Pick<
  SupabaseAuth,
  'signInWithPassword' | 'signInWithOtp' | 'getClaims' | 'signOut'
> & {
  mfa: Pick<SupabaseAuth['mfa'], 'listFactors' | 'enroll' | 'unenroll' | 'challengeAndVerify'>;
};

export type UserKind = 'internal' | 'client';

export type IdentityDeps = {
  auth: AuthPort;
  lookupUserKind: (email: string) => Promise<UserKind | null>;
  audit: (claims: VerifiedClaims, action: AuditAction) => Promise<void>;
  startActivity: (sessionId: string) => Promise<void>;
  magicLinkRedirectUrl: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function readClaims(
  auth: Pick<AuthPort, 'getClaims'>,
): Promise<VerifiedClaims | null> {
  const { data, error } = await auth.getClaims();
  if (error || !data) return null;
  const parsed = verifiedClaimsSchema.safeParse(data.claims);
  return parsed.success ? parsed.data : null;
}

export type FactorSummary = { id: string; status: string; factorType: string };

export async function listTotpFactors(auth: Pick<AuthPort, 'mfa'>): Promise<FactorSummary[]> {
  const { data, error } = await auth.mfa.listFactors();
  if (error || !data) return [];
  return data.all
    .filter((factor) => factor.factor_type === 'totp')
    .map((factor) => ({ id: factor.id, status: factor.status, factorType: factor.factor_type }));
}
