'use server';

import { revalidatePath } from 'next/cache';
import type { NewProofComment } from '@/components/proofing/proof-viewer';
import type { ProofActionResult } from '@/components/proofing/proof-errors';
import { commentOnProof, decideProof } from '@/modules/proofing/server';
import { getVerifiedClaims } from '@/platform/session';

export async function commentOnClientProofAction(
  versionId: string,
  input: NewProofComment,
): Promise<ProofActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await commentOnProof(claims, { ...input, internal: false, versionId });
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath(`/portal/proofs/${versionId}`);
  return { ok: true };
}

export async function decideProofAction(input: {
  approvalId: string;
  decision: 'approved' | 'changes_requested';
  comment: string;
}): Promise<ProofActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await decideProof(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}
