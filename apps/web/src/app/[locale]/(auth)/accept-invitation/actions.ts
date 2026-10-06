'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import {
  acceptInvitationForUser,
  auditForClaims,
  readClaims,
  startActivity,
} from '@/modules/identity';
import { createSupabaseServerClient } from '@/platform/supabase-server';

export type AcceptInvitationState = { error?: 'invalid' };

export async function acceptInvitationAction(
  _previous: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const tokenHash = String(formData.get('token_hash') ?? '');
  const accessToken = String(formData.get('access_token') ?? '');
  const refreshToken = String(formData.get('refresh_token') ?? '');
  const supabase = await createSupabaseServerClient();

  let failed = true;
  if (tokenHash) {
    failed = Boolean(
      (await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })).error,
    );
  } else if (accessToken && refreshToken) {
    failed = Boolean(
      (await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }))
        .error,
    );
  }

  const claims = failed ? null : await readClaims(supabase.auth);
  if (!claims) return { error: 'invalid' };

  await acceptInvitationForUser(claims);
  await auditForClaims(claims, 'auth.sign_in');
  if (claims.user_kind === 'internal') await startActivity(claims.session_id);

  return redirect({
    href: claims.user_kind === 'internal' ? '/set-password' : '/',
    locale: await getLocale(),
  });
}
