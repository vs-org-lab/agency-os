import { NextResponse } from 'next/server';
import { z } from 'zod';
import { proofLink } from '@/modules/proofing/server';
import { getVerifiedClaims } from '@/platform/session';

/**
 * The stable address of a proof file: checks access on every request, then redirects to a signed
 * link of 15 minutes (SEC-31). Pages keep the same src across re-renders, so comments do not
 * reload the media, and long reviews keep working after a link expires.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ versionId: string }> },
): Promise<Response> {
  const { versionId } = await context.params;
  if (!z.uuid().safeParse(versionId).success) return new NextResponse(null, { status: 404 });
  const claims = await getVerifiedClaims();
  if (!claims) return new NextResponse(null, { status: 404 });
  const url = await proofLink(claims, versionId);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
}
