import { NextResponse, type NextRequest } from 'next/server';
import { isLocale } from '@agency-os/i18n';
import { canPreviewClient } from '@/components/shell/portal-preview';
import {
  localizedPath,
  portalPathForRoom,
  previewCookieHeaders,
  previewCookieValue,
  previewRoleOf,
  safePortalPath,
} from '@/components/shell/portal-preview-path';
import { getVerifiedClaims } from '@/platform/session';
import { isSecureRequest } from '@/platform/request';

const PREVIEW_HOURS = 2;

/**
 * "Ver como cliente" (RF-053, US-12): opens the portal screen of the room section the team is on,
 * read as the client's decision maker until the preview ends. The database checks the reader.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locale: string; clientId: string }> },
): Promise<Response> {
  const { locale, clientId } = await context.params;
  const claims = await getVerifiedClaims();
  if (!isLocale(locale) || !claims || !(await canPreviewClient(claims, clientId))) {
    return new NextResponse(null, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const section = params.get('section') ?? '';
  const role = previewRoleOf(params.get('role'));
  const target = localizedPath(
    locale,
    safePortalPath(params.get('to')) ??
      portalPathForRoom(`/c/${clientId}/${section.replace(/[^a-z-]/g, '')}`, params.get('project')),
  );
  const response = NextResponse.redirect(new URL(target, request.url), {
    status: 303,
    headers: { 'cache-control': 'no-store' },
  });
  for (const cookie of previewCookieHeaders(previewCookieValue(clientId, role), {
    secure: isSecureRequest(request.headers, request.nextUrl.protocol),
    maxAgeSeconds: PREVIEW_HOURS * 60 * 60,
  })) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}
