import { NextResponse } from 'next/server';
import { z } from 'zod';
import { billingPdfLink } from '@/modules/billing/server';
import { getVerifiedClaims } from '@/platform/session';

const kindSchema = z.enum(['request', 'invoice']);

/**
 * Opens a payment request PDF or its legal invoice for staff who read billing or the client's
 * decision maker and finance contacts: checks access, then redirects to a short-lived signed URL.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
): Promise<Response> {
  const { kind, id } = await context.params;
  const parsedKind = kindSchema.safeParse(kind);
  if (!parsedKind.success || !z.uuid().safeParse(id).success) {
    return new NextResponse(null, { status: 404 });
  }
  const claims = await getVerifiedClaims();
  if (!claims) return new NextResponse(null, { status: 404 });
  const url = await billingPdfLink(claims, { kind: parsedKind.data, id });
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
}
