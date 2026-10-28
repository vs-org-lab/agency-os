import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale } from '@agency-os/i18n';
import { readPortalPreview } from '@/components/shell/portal-preview';
import { previewCookieHeaders } from '@/components/shell/portal-preview-path';
import { isSecureRequest } from '@/platform/request';

/** Ends the client preview and returns the team to the client's room. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await context.params;
  const clientId = await readPortalPreview();
  const prefix = isLocale(locale) && locale !== defaultLocale ? `/${locale}` : '';
  const target = clientId ? `${prefix}/c/${clientId}` : `${prefix}/`;
  const response = NextResponse.redirect(new URL(target, request.url), {
    status: 303,
    headers: { 'cache-control': 'no-store' },
  });
  for (const cookie of previewCookieHeaders('', {
    secure: isSecureRequest(request.headers, request.nextUrl.protocol),
    maxAgeSeconds: 0,
  })) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}
