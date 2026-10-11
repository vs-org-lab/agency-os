'use server';

import type { ProjectDocumentKind } from '@agency-os/db';
import type { ActionResult } from '@/components/project-documents/document-errors';
import {
  askDocumentApproval,
  commentOnDocument,
  decideDocument,
  finishDocumentUpload,
  removeRoomDocument,
  shareRoomDocument,
  startDocumentVersion,
  startProjectDocument,
  withdrawRoomDocument,
} from '@/modules/project-documents/server';
import { getVerifiedClaims } from '@/platform/session';

const NOT_FOUND = { ok: false, code: 'not_found' } as const;

type Started = { ok: true; versionId: string; uploadUrl: string | null };

function outcome(result: { ok: true } | { ok: false; rule: string }): ActionResult {
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function startDocumentAction(input: {
  projectId: string;
  title: string;
  kind: ProjectDocumentKind;
  url?: string;
  file?: { name: string; sizeBytes: number };
}): Promise<(Started & { documentId: string }) | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await startProjectDocument(claims, input);
  return result.ok
    ? {
        ok: true,
        documentId: result.documentId,
        versionId: result.versionId,
        uploadUrl: result.uploadUrl,
      }
    : { ok: false, code: result.rule };
}

export async function startVersionAction(input: {
  documentId: string;
  url?: string;
  file?: { name: string; sizeBytes: number };
}): Promise<Started | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await startDocumentVersion(claims, input);
  return result.ok
    ? { ok: true, versionId: result.versionId, uploadUrl: result.uploadUrl }
    : { ok: false, code: result.rule };
}

export async function finishDocumentUploadAction(versionId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await finishDocumentUpload(claims, versionId)) : NOT_FOUND;
}

export async function shareDocumentAction(documentId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await shareRoomDocument(claims, documentId)) : NOT_FOUND;
}

export async function withdrawDocumentAction(documentId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await withdrawRoomDocument(claims, documentId)) : NOT_FOUND;
}

export async function removeDocumentAction(documentId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await removeRoomDocument(claims, documentId)) : NOT_FOUND;
}

export async function requestDocumentApprovalAction(documentId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await askDocumentApproval(claims, documentId);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function commentDocumentAction(input: {
  documentId: string;
  body: string;
  internal: boolean;
}): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await commentOnDocument(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function decideDocumentAction(input: {
  approvalId: string;
  decision: 'approved' | 'changes_requested';
  comment: string;
}): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return NOT_FOUND;
  const result = await decideDocument(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}
