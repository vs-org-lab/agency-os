import { NextResponse } from 'next/server';
import { isBrandHubSiteOrigin } from '@/modules/brand-hub/server';
import { corsHeaders } from '@/platform/cors';

/** The CORS headers for the request's origin: the site's origins and connected client domains. */
async function siteCors(request: Request): Promise<Record<string, string>> {
  const origin = request.headers.get('origin');
  const allowed = origin && (await isBrandHubSiteOrigin(origin)) ? [origin] : [];
  return corsHeaders(origin, allowed);
}

/** A JSON answer to the published site, never cached, with CORS for the allowed origins. */
export async function siteResponse(
  request: Request,
  status: number,
  body: unknown,
): Promise<Response> {
  return NextResponse.json(body, {
    status,
    headers: { ...(await siteCors(request)), 'cache-control': 'no-store' },
  });
}

export async function sitePreflight(request: Request): Promise<Response> {
  return new NextResponse(null, { status: 204, headers: await siteCors(request) });
}

/** The site token from `Authorization: Bearer <token>`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() || null : null;
}
