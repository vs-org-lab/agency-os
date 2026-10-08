import { NextResponse } from 'next/server';
import { z } from 'zod';
import { commercialSession } from '@/modules/commercial/server';
import { coreEvidenceUrl } from '@/modules/diagnosis/server';
import { getVerifiedClaims } from '@/platform/session';

/**
 * Opens a piece of audit evidence: checks access, then redirects to a short-lived signed
 * URL. A plain link keeps the browser's user gesture, so no popup blocker gets in the way.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ findingId: string }> },
): Promise<Response> {
  const { findingId } = await context.params;
  if (!z.uuid().safeParse(findingId).success) return new NextResponse(null, { status: 404 });
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) return new NextResponse(null, { status: 404 });
  const url = await coreEvidenceUrl(session, { findingId });
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
}
