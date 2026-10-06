'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createIdentityDeps, verifyTotp } from '@/modules/identity';
import { safeNextPath } from './safe-next-path';

export type VerifyTotpState = { error?: 'invalid_code' };

export async function verifyTotpAction(
  _previous: VerifyTotpState,
  formData: FormData,
): Promise<VerifyTotpState> {
  const mode = formData.get('mode') === 'enroll' ? 'enroll' : 'verify';
  const locale = await getLocale();
  const result = await verifyTotp(
    {
      factorId: String(formData.get('factorId') ?? ''),
      code: String(formData.get('code') ?? ''),
      mode,
    },
    await createIdentityDeps(locale),
  );
  if ('error' in result) return { error: result.error };

  return redirect({ href: safeNextPath(formData.get('next')), locale });
}
