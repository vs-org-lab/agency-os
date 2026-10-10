'use server';

import { revalidatePath } from 'next/cache';
import type { NewProofComment } from '@/components/proofing/proof-viewer';
import type { ProofActionResult } from '@/components/proofing/proof-errors';
import {
  askProofApproval,
  commentOnProof,
  finishProofUpload,
  resolveComment,
  saveRevisionLimit,
  startProof,
  startProofVersion,
} from '@/modules/proofing/server';
import { withdrawRoomApproval } from '@/modules/rooms/server';
import { getVerifiedClaims } from '@/platform/session';

export type StartUploadResult =
  { ok: true; versionId: string; uploadUrl: string } | { ok: false; code: string };

function done(result: { ok: true } | { ok: false; rule: string }): ProofActionResult {
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath('/c', 'layout');
  return { ok: true };
}

export async function startProofAction(
  projectId: string,
  title: string,
): Promise<StartUploadResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await startProof(claims, { projectId, title });
  return result.ok
    ? { ok: true, versionId: result.versionId, uploadUrl: result.uploadUrl }
    : { ok: false, code: result.rule };
}

export async function startProofVersionAction(fileId: string): Promise<StartUploadResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await startProofVersion(claims, fileId);
  return result.ok
    ? { ok: true, versionId: result.versionId, uploadUrl: result.uploadUrl }
    : { ok: false, code: result.rule };
}

export async function finishProofUploadAction(versionId: string): Promise<ProofActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await finishProofUpload(claims, versionId);
  return done(result.ok ? { ok: true } : result);
}

export async function requestProofApprovalAction(versionId: string): Promise<ProofActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await askProofApproval(claims, versionId);
  return done(result.ok ? { ok: true } : result);
}

export async function withdrawProofApprovalAction(approvalId: string): Promise<ProofActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  return done(await withdrawRoomApproval({ claims }, approvalId));
}

export async function commentOnProofAction(
  versionId: string,
  input: NewProofComment,
): Promise<ProofActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await commentOnProof(claims, { versionId, ...input });
  return done(result.ok ? { ok: true } : result);
}

export async function resolveProofCommentAction(
  commentId: string,
  resolved: boolean,
): Promise<ProofActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  return done(await resolveComment(claims, commentId, resolved));
}

export async function saveRevisionLimitAction(
  projectId: string,
  limit: number,
): Promise<ProofActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  return done(await saveRevisionLimit(claims, projectId, limit));
}
