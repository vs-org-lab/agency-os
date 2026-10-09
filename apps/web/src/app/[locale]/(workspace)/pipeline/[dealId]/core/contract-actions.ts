'use server';

import { revalidatePath } from 'next/cache';
import { commercialSession } from '@/modules/commercial/server';
import {
  saveProposal,
  sendDealProposal,
  withdrawDealProposal,
  type ProposalDraftInput,
} from '@/modules/contracts/server';
import { getVerifiedClaims } from '@/platform/session';

export type ContractActionResult = { ok: true } | { ok: false; code: string };

export type SaveProposalResult = { ok: true; proposalId: string } | { ok: false; code: string };

async function session() {
  return commercialSession(await getVerifiedClaims());
}

function refresh(dealId: string) {
  revalidatePath(`/pipeline/${dealId}`);
}

export async function saveProposalAction(input: ProposalDraftInput): Promise<SaveProposalResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await saveProposal(current, input);
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(input.dealId);
  return { ok: true, proposalId: result.proposalId };
}

export async function sendProposalAction(
  proposalId: string,
  dealId: string,
): Promise<ContractActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await sendDealProposal(current, { proposalId });
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  return { ok: true };
}

export async function withdrawProposalAction(
  proposalId: string,
  dealId: string,
): Promise<ContractActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = await withdrawDealProposal(current, { proposalId });
  if (!result.ok) return { ok: false, code: result.rule };
  refresh(dealId);
  return { ok: true };
}
