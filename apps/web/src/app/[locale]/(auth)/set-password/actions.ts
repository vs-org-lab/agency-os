'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createSetPasswordDeps, setPassword } from '@/modules/identity';
import { getVerifiedClaims } from '@/platform/session';

export type SetPasswordState = {
  error?: 'too_short' | 'pwned' | 'check_unavailable' | 'update_failed' | 'session_expired';
};

export async function setPasswordAction(
  _previous: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const claims = await getVerifiedClaims();
  if (!claims) return { error: 'session_expired' };

  const password = String(formData.get('password') ?? '').slice(0, 1024);
  const result = await setPassword(claims, { password }, await createSetPasswordDeps());
  if ('error' in result) return { error: result.error };

  return redirect({ href: claims.aal === 'aal2' ? '/' : '/mfa/enroll', locale: await getLocale() });
}
