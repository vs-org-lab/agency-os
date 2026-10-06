'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { redirect } from '@/i18n/navigation';
import {
  changePassword,
  clearActivity,
  createChangePasswordDeps,
  revokeSession,
  sessionDeps,
} from '@/modules/identity';
import { getVerifiedClaims } from '@/platform/session';
import { createSupabaseServerClient } from '@/platform/supabase-server';

export type RevokeSessionState = { error?: 'revoke_failed' };

export async function revokeSessionAction(
  _previous: RevokeSessionState,
  formData: FormData,
): Promise<RevokeSessionState> {
  const claims = await getVerifiedClaims();
  const locale = await getLocale();
  if (!claims) return redirect({ href: '/sign-in', locale });

  const sessionId = z.uuid().safeParse(formData.get('sessionId'));
  if (!sessionId.success) return { error: 'revoke_failed' };

  const { revoked } = await revokeSession(claims, sessionId.data, sessionDeps());
  if (!revoked) return { error: 'revoke_failed' };

  if (sessionId.data === claims.session_id) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'local' });
    await clearActivity();
    return redirect({ href: '/sign-in', locale });
  }

  revalidatePath('/', 'layout');
  return {};
}

export type ChangePasswordState = {
  error?: 'too_short' | 'pwned' | 'check_unavailable' | 'update_failed';
};

export async function changePasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const claims = await getVerifiedClaims();
  const locale = await getLocale();
  if (!claims) return redirect({ href: '/sign-in', locale });

  const password = String(formData.get('password') ?? '').slice(0, 1024);
  const result = await changePassword(claims, { password }, await createChangePasswordDeps());
  if ('error' in result) return { error: result.error };

  return redirect({ href: '/sign-in', locale });
}
