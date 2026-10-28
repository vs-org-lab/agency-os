import 'server-only';
import { cookies, headers } from 'next/headers';
import { PORTAL_PREVIEW_COOKIE } from './preview-cookie';
import { verifiedClaimsSchema, withSystemContext, type VerifiedClaims } from './db';
import { isSessionActive } from './session-state';
import { createSupabaseServerClient } from './supabase-server';

/**
 * The signed-in user's claims for a server action or route. Portal actions get none while the
 * team previews the portal, so a preview never acts in the client's name.
 */
export async function getVerifiedClaims(): Promise<VerifiedClaims | null> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  if (requestHeaders.has('next-action') && cookieStore.has(PORTAL_PREVIEW_COOKIE)) return null;
  return getSessionClaims();
}

/** The signed-in user's claims, verified against the auth server and the active session. */
export async function getSessionClaims(): Promise<VerifiedClaims | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const parsed = verifiedClaimsSchema.safeParse(data.claims);
  if (!parsed.success) return null;
  if (!(await isSessionActive(parsed.data, { withSystemContext }))) return null;

  return parsed.data;
}
