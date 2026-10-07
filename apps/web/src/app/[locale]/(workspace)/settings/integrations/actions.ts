'use server';

import { cookies, headers } from 'next/headers';
import { redirect as redirectExternal } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import {
  disconnectGoogleCalendar,
  googleOauthCookieName,
  startGoogleConnection,
} from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import { isSecureRequest } from '@/platform/request';

const REAUTHENTICATE_PATH = '/mfa/verify?reason=reauthenticate&next=/settings/integrations';

export async function connectGoogleAction(): Promise<void> {
  const locale = await getLocale();
  const claims = await getVerifiedClaims();
  if (!claims) return redirect({ href: '/sign-in', locale });

  const result = startGoogleConnection(claims);
  if (!result.ok) {
    if (result.reason === 'reauthenticate') return redirect({ href: REAUTHENTICATE_PATH, locale });
    return redirect({ href: '/settings/integrations?result=error', locale });
  }

  const secure = isSecureRequest(await headers());
  (await cookies()).set(googleOauthCookieName(secure), result.cookieValue, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: result.cookieMaxAgeSeconds,
  });
  return redirectExternal(result.authorizationUrl);
}

export async function disconnectGoogleAction(): Promise<void> {
  const locale = await getLocale();
  const claims = await getVerifiedClaims();
  if (!claims) return redirect({ href: '/sign-in', locale });

  const result = await disconnectGoogleCalendar(claims);
  if (!result.ok) return redirect({ href: REAUTHENTICATE_PATH, locale });
  return redirect({ href: '/settings/integrations?result=disconnected', locale });
}
