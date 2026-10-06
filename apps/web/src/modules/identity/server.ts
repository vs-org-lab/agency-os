import 'server-only';
import { sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import type { Locale } from '@agency-os/i18n';
import { resolveActor } from '@/modules/access';
import { recordAudit, type AuditAction } from '@/modules/audit';
import { activityCookieName, INACTIVITY_LIMIT_MS, signActivity } from '@/platform/activity-cookie';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { serverEnv } from '@/platform/env';
import { clientIpAddress, isSecureRequest, requestOrigin } from '@/platform/request';
import { createSupabaseServerClient } from '@/platform/supabase-server';
import { createSupabaseAdminPort } from './admin';
import type { IdentityDeps, UserKind } from './auth-port';
import { isPwnedPassword } from './hibp';
import { acceptInvitation, type InvitationDeps } from './invitations';
import type { SetPasswordDeps } from './set-password';

export async function lookupUserKindByEmail(email: string): Promise<UserKind | null> {
  const rows = await withSystemContext((tx) =>
    tx.execute<{ kind: UserKind }>(sql`
      select p.kind::text as kind
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(u.email) = ${email} and p.archived_at is null
      limit 1
    `),
  );
  return rows[0]?.kind ?? null;
}

export async function auditForClaims(claims: VerifiedClaims, action: AuditAction): Promise<void> {
  const requestHeaders = await headers();
  await withUserContext(claims, async (tx) => {
    const actor = await resolveActor(tx, claims);
    if (!actor) return;
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action,
      resourceType: 'session',
      resourceId: claims.session_id,
      ipAddress: clientIpAddress(requestHeaders),
      userAgent: requestHeaders.get('user-agent'),
    });
  });
}

export async function startActivity(sessionId: string): Promise<void> {
  const requestHeaders = await headers();
  const secure = isSecureRequest(requestHeaders);
  const cookieStore = await cookies();
  cookieStore.set(
    activityCookieName(secure),
    signActivity(new Date(), serverEnv().SESSION_ACTIVITY_SECRET, sessionId),
    { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: INACTIVITY_LIMIT_MS / 1000 },
  );
}

export async function clearActivity(): Promise<void> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  cookieStore.delete(activityCookieName(isSecureRequest(requestHeaders)));
}

export function callbackPath(locale: Locale): string {
  return locale === 'pt-PT' ? '/callback' : `/${locale}/callback`;
}

export async function createIdentityDeps(locale: Locale): Promise<IdentityDeps> {
  const supabase = await createSupabaseServerClient();
  const origin = requestOrigin(await headers());

  return {
    auth: supabase.auth,
    lookupUserKind: lookupUserKindByEmail,
    audit: auditForClaims,
    startActivity,
    magicLinkRedirectUrl: `${origin}${callbackPath(locale)}`,
  };
}

export async function createInvitationDeps(locale: Locale): Promise<InvitationDeps> {
  const env = serverEnv();
  const contexts = { withUserContext, withSystemContext };
  const origin = requestOrigin(await headers());
  const prefix = locale === 'pt-PT' ? '' : `/${locale}`;

  return {
    contexts,
    admin: createSupabaseAdminPort(
      { url: env.NEXT_PUBLIC_SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY },
      contexts,
    ),
    invitationRedirectUrl: `${origin}${prefix}/accept-invitation`,
  };
}

export async function createSetPasswordDeps(): Promise<SetPasswordDeps> {
  const supabase = await createSupabaseServerClient();
  return {
    updatePassword: async (password) => ({
      ok: !(await supabase.auth.updateUser({ password })).error,
    }),
    isPwned: (password) => isPwnedPassword(password),
    audit: auditForClaims,
  };
}

export function acceptInvitationForUser(claims: VerifiedClaims): Promise<{ activated: number }> {
  return acceptInvitation(claims, { contexts: { withUserContext, withSystemContext } });
}
