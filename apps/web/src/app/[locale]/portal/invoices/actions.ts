'use server';

import { startPortalCheckout } from '@/modules/billing/server';
import { getVerifiedClaims } from '@/platform/session';
import type { PayResult } from './invoice-card';

export async function payByCardAction(requestId: string): Promise<PayResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await startPortalCheckout(claims, { requestId });
  return result.ok ? result : { ok: false, code: result.rule };
}
