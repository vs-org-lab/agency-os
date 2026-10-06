'use server';

import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { redirect } from '@/i18n/navigation';
import { createIdentityDeps, signInWithPassword } from '@/modules/identity';

export type SignInState = {
  email: string;
  error?: 'invalid_credentials' | 'email_invalid' | 'password_required';
};

const signInSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(1024),
});

const NEXT_PATH = { mfa_enroll: '/mfa/enroll', mfa_verify: '/mfa/verify', done: '/' } as const;

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const parsed = signInSchema.safeParse({ email, password: formData.get('password') ?? '' });
  if (!parsed.success) {
    const emailInvalid = parsed.error.issues.some((issue) => issue.path[0] === 'email');
    return { email, error: emailInvalid ? 'email_invalid' : 'password_required' };
  }

  const locale = await getLocale();
  const result = await signInWithPassword(parsed.data, await createIdentityDeps(locale));
  if ('error' in result) return { email, error: result.error };

  return redirect({ href: NEXT_PATH[result.next], locale });
}
