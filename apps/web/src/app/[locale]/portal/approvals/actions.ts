'use server';

import { decideRoomApproval } from '@/modules/rooms/server';
import { getVerifiedClaims } from '@/platform/session';

export async function decideApprovalAction(input: {
  approvalId: string;
  decision: 'approved' | 'changes_requested';
  comment: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await decideRoomApproval(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}
