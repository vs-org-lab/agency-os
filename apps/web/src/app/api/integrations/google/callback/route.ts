import { NextResponse, type NextRequest } from 'next/server';
import { completeGoogleConnection, googleOauthCookieName } from '@/modules/commercial/server';
import { logger } from '@/platform/logger';
import { isSecureRequest } from '@/platform/request';
import { getVerifiedClaims } from '@/platform/session';

const SETTINGS_PATH = '/settings/integrations';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secure = isSecureRequest(request.headers, request.nextUrl.protocol);
  const cookieName = googleOauthCookieName(secure);
  const claims = await getVerifiedClaims();

  const destination = new URL(SETTINGS_PATH, request.url);
  if (!claims) {
    destination.pathname = '/sign-in';
  } else {
    try {
      const result = await completeGoogleConnection(claims, {
        code: request.nextUrl.searchParams.get('code'),
        state: request.nextUrl.searchParams.get('state'),
        cookieValue: request.cookies.get(cookieName)?.value,
      });
      destination.searchParams.set('result', result.ok ? 'connected' : 'error');
    } catch (error) {
      logger.error('commercial.google_connection_failed', { error });
      destination.searchParams.set('result', 'error');
    }
  }

  const response = NextResponse.redirect(destination);
  response.cookies.delete(cookieName);
  return response;
}
