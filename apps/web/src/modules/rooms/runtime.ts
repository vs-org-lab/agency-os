import 'server-only';
import type { DbTransaction } from '@agency-os/db';
import { isPipelineCode } from '@/modules/commercial';
import { applyStageChange } from '@/modules/commercial/server';
import { logger } from '@/platform/logger';
import { withSystemContext, withUserContext } from '@/platform/db';
import type { RoomsDeps } from './runtime-types';

/** Moves the deal as the system; a refused move is logged and the process carries on. */
async function moveDealWithProcess(tx: DbTransaction, dealId: string, code: string) {
  if (!isPipelineCode(code)) return;
  const change = await applyStageChange(tx, { dealId, to: code, reason: null, actor: 'system' });
  if (!change.ok) logger.warn('rooms.deal_not_moved', { dealId, code, rule: change.rule });
}

export function roomsDeps(): RoomsDeps {
  return {
    contexts: { withUserContext, withSystemContext },
    moveDeal: moveDealWithProcess,
  };
}
