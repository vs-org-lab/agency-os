import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hubAssetLink } from '@/modules/brand-hub/server';
import { getVerifiedClaims } from '@/platform/session';

/**
 * The stable address of a brand hub asset: checks access on every request, then redirects to a
 * signed link of 15 minutes (SEC-31), so images keep the same src across renders.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  const { assetId } = await context.params;
  if (!z.uuid().safeParse(assetId).success) return new NextResponse(null, { status: 404 });
  const claims = await getVerifiedClaims();
  if (!claims) return new NextResponse(null, { status: 404 });
  const url = await hubAssetLink(claims, assetId);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
}
