import { NextResponse } from 'next/server';
import { z } from 'zod';
import { documentVersionLink } from '@/modules/project-documents/server';
import { getVerifiedClaims } from '@/platform/session';

/**
 * The stable address of a room document file: checks access on every request, then redirects to a
 * signed link of 15 minutes (SEC-31). The PDF viewer keeps the same src across re-renders.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ versionId: string }> },
): Promise<Response> {
  const { versionId } = await context.params;
  if (!z.uuid().safeParse(versionId).success) return new NextResponse(null, { status: 404 });
  const claims = await getVerifiedClaims();
  if (!claims) return new NextResponse(null, { status: 404 });
  const url = await documentVersionLink(claims, versionId);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
}
