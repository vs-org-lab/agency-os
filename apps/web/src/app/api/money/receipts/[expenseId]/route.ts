import { NextResponse } from 'next/server';
import { moneyReceiptUrl } from '@/modules/money/server';
import { getVerifiedClaims } from '@/platform/session';

/**
 * An expense's receipt: checks access on every request (billing readers, or the client's decision
 * maker and finance contact for receipts linked to their requests), then redirects to a signed link
 * of 15 minutes (SEC-32).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ expenseId: string }> },
): Promise<Response> {
  const { expenseId } = await context.params;
  const claims = await getVerifiedClaims();
  if (!claims) return new NextResponse(null, { status: 404 });
  const url = await moneyReceiptUrl(claims, expenseId);
  if (!url) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
}
