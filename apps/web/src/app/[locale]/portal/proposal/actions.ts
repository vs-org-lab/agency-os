'use server';

import { revalidatePath } from 'next/cache';
import {
  acceptPortalProposal,
  requestPortalProposalChanges,
  type AcceptProposalInput,
} from '@/modules/contracts/server';
import { getVerifiedClaims } from '@/platform/session';

export type AcceptActionResult = { ok: true; contractId: string } | { ok: false; code: string };

export type ChangesActionResult = { ok: true } | { ok: false; code: string };

export async function acceptProposalAction(
  input: AcceptProposalInput,
): Promise<AcceptActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await acceptPortalProposal(claims, input);
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath('/portal');
  revalidatePath('/portal/proposal');
  return { ok: true, contractId: result.contractId };
}

export async function requestChangesAction(
  proposalId: string,
  message: string,
): Promise<ChangesActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await requestPortalProposalChanges(claims, { proposalId, message });
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}
