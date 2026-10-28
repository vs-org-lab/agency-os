import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale } from '@agency-os/i18n';
import { readPortalPreview } from '@/components/shell/portal-preview';
import { PORTAL_PREVIEW_COOKIE, portalCookiePaths } from '@/components/shell/portal-preview-path';

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
  for (const path of portalCookiePaths()) {
    response.cookies.set(PORTAL_PREVIEW_COOKIE, '', { path, maxAge: 0 });
  }
  return response;
}
