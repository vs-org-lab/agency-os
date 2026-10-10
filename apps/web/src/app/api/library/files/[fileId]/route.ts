import { NextResponse } from 'next/server';
import { z } from 'zod';
import { libraryFileLink } from '@/modules/library/server';
import { getVerifiedClaims } from '@/platform/session';

/**
 * The stable address of a library file: checks access on every request, then redirects to a
 * signed link of 15 minutes that downloads the file under its name (SEC-31).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const { fileId } = await context.params;
  if (!z.uuid().safeParse(fileId).success) return new NextResponse(null, { status: 404 });
  const claims = await getVerifiedClaims();
  if (!claims) return new NextResponse(null, { status: 404 });
  const url = await libraryFileLink(claims, fileId);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
}
