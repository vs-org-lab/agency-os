import { NextResponse } from 'next/server';
import { receiveStripeWebhook } from '@/modules/billing/server';

export const dynamic = 'force-dynamic';

/** Stripe payment notifications; the body is verified against the endpoint signing secret. */
export async function POST(request: Request): Promise<Response> {
  const status = await receiveStripeWebhook(
    await request.text(),
    request.headers.get('stripe-signature'),
  );
  return new NextResponse(null, { status, headers: { 'cache-control': 'no-store' } });
}
