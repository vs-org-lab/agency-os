'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { auditForClaims, clearActivity } from '@/modules/identity';
import { getVerifiedClaims } from '@/platform/session';
import { createSupabaseServerClient } from '@/platform/supabase-server';

export async function signOutAction(): Promise<void> {
  const claims = await getVerifiedClaims();
  if (claims) await auditForClaims(claims, 'auth.sign_out');

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  await clearActivity();

  redirect({ href: '/sign-in', locale: await getLocale() });
}
