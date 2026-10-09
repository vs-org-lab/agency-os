import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { routing } from './i18n/routing';
import {
  activityCookieName,
  INACTIVITY_LIMIT_MS,
  isInactive,
  shouldRefreshActivity,
  signActivity,
  verifyActivity,
} from './platform/activity-cookie';
import { isSecureRequest } from './platform/request';
import {
  allowsMediaCapture,
  buildSecurityHeaders,
  embedOriginsForPath,
  generateNonce,
} from './platform/security-headers';

const intlMiddleware = createIntlMiddleware(routing);

const SIGN_IN_PATH = '/sign-in';

function applyHeaders(response: NextResponse, headers: Headers): NextResponse {
  for (const [name, value] of headers) response.headers.set(name, value);
  return response;
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  const activitySecret = process.env.SESSION_ACTIVITY_SECRET ?? '';
  const secure = isSecureRequest(request.headers, request.nextUrl.protocol);
  const securityHeaders = buildSecurityHeaders(nonce, {
    isDevelopment: process.env.NODE_ENV === 'development',
    connectSources: supabaseUrl ? [supabaseUrl] : [],
    frameAncestors: embedOriginsForPath(request.nextUrl.pathname, process.env.APPLY_EMBED_ORIGINS),
    mediaCapture: allowsMediaCapture(request.nextUrl.pathname),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(
    'Content-Security-Policy',
    securityHeaders.get('Content-Security-Policy') ?? '',
  );
  const forwardedRequest = new NextRequest(request, { headers: requestHeaders });

  const response = intlMiddleware(forwardedRequest);
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, ...cookieOptions });
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { user_kind?: string | null; session_id?: string } | undefined;

  if (claims?.user_kind === 'internal' && claims.session_id) {
    const now = new Date();
    const cookieName = activityCookieName(secure);
    const activity = verifyActivity(
      request.cookies.get(cookieName)?.value,
      activitySecret,
      claims.session_id,
      now,
    );

    if (!activity.valid || isInactive(activity.at, now)) {
      await supabase.auth.signOut({ scope: 'local' });
      const signInUrl = new URL(SIGN_IN_PATH, request.url);
      signInUrl.searchParams.set('reason', 'inactive');
      const redirect = NextResponse.redirect(signInUrl);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      redirect.cookies.delete(cookieName);
      return applyHeaders(redirect, securityHeaders);
    }

    if (shouldRefreshActivity(activity.at, now)) {
      response.cookies.set(cookieName, signActivity(now, activitySecret, claims.session_id), {
        ...cookieOptions,
        maxAge: INACTIVITY_LIMIT_MS / 1000,
      });
    }
  }

  return applyHeaders(response, securityHeaders);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|monitoring|.*\\..*).*)'],
};
