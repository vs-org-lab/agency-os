import { NextResponse } from 'next/server';
import { z } from 'zod';
import { contractDownloadUrl } from '@/modules/contracts/server';
import { getVerifiedClaims } from '@/platform/session';

/**
 * Opens the signed contract PDF for staff with pipeline access or the client's signer: checks
 * access, then redirects to a short-lived signed URL.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ contractId: string }> },
): Promise<Response> {
  const { contractId } = await context.params;
  if (!z.uuid().safeParse(contractId).success) return new NextResponse(null, { status: 404 });
  const claims = await getVerifiedClaims();
  if (!claims) return new NextResponse(null, { status: 404 });
  const url = await contractDownloadUrl(claims, contractId);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
}
