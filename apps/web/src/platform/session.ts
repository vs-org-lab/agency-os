import 'server-only';
import { verifiedClaimsSchema, withSystemContext, type VerifiedClaims } from './db';
import { isSessionActive } from './session-state';
import { createSupabaseServerClient } from './supabase-server';

export async function getVerifiedClaims(): Promise<VerifiedClaims | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const parsed = verifiedClaimsSchema.safeParse(data.claims);
  if (!parsed.success) return null;
  if (!(await isSessionActive(parsed.data, { withSystemContext }))) return null;

  return parsed.data;
}
