import 'server-only';
import { verifiedClaimsSchema, type VerifiedClaims } from './db';
import { createSupabaseServerClient } from './supabase-server';

export async function getVerifiedClaims(): Promise<VerifiedClaims | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const parsed = verifiedClaimsSchema.safeParse(data.claims);
  return parsed.success ? parsed.data : null;
}
