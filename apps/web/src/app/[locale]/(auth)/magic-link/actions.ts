'use server';

import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { createIdentityDeps, requestMagicLink } from '@/modules/identity';

export type MagicLinkState = { email: string; status: 'idle' | 'sent' | 'email_invalid' };

export async function magicLinkAction(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!z.email().max(320).safeParse(email).success) return { email, status: 'email_invalid' };

  await requestMagicLink({ email }, await createIdentityDeps(await getLocale()));
  return { email, status: 'sent' };
}
