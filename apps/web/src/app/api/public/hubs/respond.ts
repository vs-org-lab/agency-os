import { NextResponse } from 'next/server';
import { corsHeaders } from '@/platform/cors';
import { brandHubSiteEnv } from '@/platform/env';

/** A JSON answer to the published site, never cached, with CORS for the configured origins. */
export function siteResponse(request: Request, status: number, body: unknown): Response {
  const origins = brandHubSiteEnv()?.origins ?? [];
  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeaders(request.headers.get('origin'), origins),
      'cache-control': 'no-store',
    },
  });
}

export function sitePreflight(request: Request): Response {
  const origins = brandHubSiteEnv()?.origins ?? [];
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin'), origins),
  });
}

/** The site token from `Authorization: Bearer <token>`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() || null : null;
}
