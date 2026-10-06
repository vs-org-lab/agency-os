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
import type { IdentityDeps, UserKind } from './auth-port';

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
