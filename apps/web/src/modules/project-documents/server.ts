import 'server-only';
import type { ProjectDocumentKind } from '@agency-os/db';
import { createSupabaseLibraryStorage } from '@/modules/library/server';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { DocumentsDeps } from './access';
import { decideDocumentApproval, requestDocumentApproval } from './approvals';
import { addDocumentComment } from './comments';
import { removeProjectDocument, shareProjectDocument, withdrawProjectDocument } from './lifecycle';
import {
  documentVersionUrl,
  loadPortalDocument,
  loadPortalDocuments,
  loadRoomDocuments,
  loadStaffDocument,
} from './readers';
import { addDocumentVersion, confirmDocumentVersion, createProjectDocument } from './versions';

const deps = (): DocumentsDeps => ({
  contexts: { withUserContext, withSystemContext },
  storage: createSupabaseLibraryStorage(),
});

export function loadClientRoomDocuments(
  claims: VerifiedClaims,
  clientId: string,
  projectId?: string,
) {
  return loadRoomDocuments(claims, { clientId, ...(projectId ? { projectId } : {}) }, deps());
}

export function loadRoomDocument(claims: VerifiedClaims, documentId: string) {
  return loadStaffDocument(claims, documentId, deps());
}

export function loadClientPortalDocuments(claims: VerifiedClaims, clientId: string) {
  return loadPortalDocuments(claims, clientId, deps());
}

export function loadClientPortalDocument(claims: VerifiedClaims, documentId: string) {
  return loadPortalDocument(claims, documentId, deps());
}

export function documentVersionLink(claims: VerifiedClaims, versionId: string) {
  return documentVersionUrl(claims, versionId, deps());
}

export function startProjectDocument(
  claims: VerifiedClaims,
  input: {
    projectId: string;
    title: string;
    kind: ProjectDocumentKind;
    url?: string;
    file?: { name: string; sizeBytes: number };
  },
) {
  return createProjectDocument(claims, input, deps());
}

export function startDocumentVersion(
  claims: VerifiedClaims,
  input: { documentId: string; url?: string; file?: { name: string; sizeBytes: number } },
) {
  return addDocumentVersion(claims, input, deps());
}

export function finishDocumentUpload(claims: VerifiedClaims, versionId: string) {
  return confirmDocumentVersion(claims, { versionId }, deps());
}

export function shareRoomDocument(claims: VerifiedClaims, documentId: string) {
  return shareProjectDocument(claims, { documentId }, deps());
}

export function withdrawRoomDocument(claims: VerifiedClaims, documentId: string) {
  return withdrawProjectDocument(claims, { documentId }, deps());
}

export function removeRoomDocument(claims: VerifiedClaims, documentId: string) {
  return removeProjectDocument(claims, { documentId }, deps());
}

export function askDocumentApproval(claims: VerifiedClaims, documentId: string) {
  return requestDocumentApproval(claims, { documentId }, deps());
}

export function decideDocument(
  claims: VerifiedClaims,
  input: { approvalId: string; decision: 'approved' | 'changes_requested'; comment: string },
) {
  return decideDocumentApproval(claims, input, deps());
}

export function commentOnDocument(
  claims: VerifiedClaims,
  input: { documentId: string; body: string; internal?: boolean },
) {
  return addDocumentComment(claims, input, deps());
}

export { DOCUMENT_FUNCTIONS } from './automations';
export { documentEditor, type DocumentsDeps } from './access';
export { publishGeneratedPdf, type GeneratedPdf } from './publish';
export const roomDocumentsDeps = deps;
