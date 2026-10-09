import 'server-only';
import type { DbTransaction } from '@agency-os/db';
import { applyStageChange } from '@/modules/commercial/server';
import { commercialEnv } from '@/platform/env';
import { logger } from '@/platform/logger';
import { withSystemContext, withUserContext } from '@/platform/db';
import type { BillingDeps } from './requests';
import { createSupabaseBillingStorage } from './supabase-storage';

/** The stage a deal enters with its first reconciled payment (AUT-13). */
const KICKOFF_CODE = '2.2';

async function moveDealToKickoff(tx: DbTransaction, dealId: string): Promise<void> {
  const change = await applyStageChange(tx, {
    dealId,
    to: KICKOFF_CODE,
    reason: null,
    actor: 'system',
  });
  if (!change.ok) logger.warn('billing.deal_not_moved', { dealId, rule: change.rule });
}

export function billingDeps(): BillingDeps {
  return {
    contexts: { withUserContext, withSystemContext },
    storage: createSupabaseBillingStorage(),
    appBaseUrl: commercialEnv().APP_BASE_URL,
    moveDeal: moveDealToKickoff,
  };
}
