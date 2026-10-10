import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { decideFileApproval, requestVersionApproval, setRevisionLimit } from './approvals';
import { addProofComment, resolveProofComment } from './comments';
import {
  addProofVersion,
  confirmProofVersion,
  createProofFile,
  proofFileUrl,
  type ProofingDeps,
} from './files';
import { getClientProofVersion } from './portal';
import { createSupabaseProofStorage } from './supabase-storage';
import { loadProofs, loadProofVersion, loadRounds } from './views';

const deps = (): ProofingDeps => ({
  contexts: { withUserContext, withSystemContext },
  storage: createSupabaseProofStorage(),
});

export function loadProjectProofs(claims: VerifiedClaims, clientId: string, projectId: string) {
  return loadProofs(claims, { clientId, projectId }, deps());
}

export function loadProjectRounds(claims: VerifiedClaims, projectId: string) {
  return loadRounds(claims, projectId, deps());
}

export function loadStaffProofVersion(claims: VerifiedClaims, versionId: string) {
  return loadProofVersion(claims, versionId, deps());
}

export function loadClientProofVersion(claims: VerifiedClaims, versionId: string) {
  return withUserContext(claims, (tx) => getClientProofVersion(tx, versionId));
}

export function proofLink(claims: VerifiedClaims, versionId: string) {
  return proofFileUrl(claims, versionId, deps());
}

export function startProof(
  claims: VerifiedClaims,
  input: { projectId: string; phaseId?: string | null; title: string },
) {
  return createProofFile(claims, input, deps());
}

export function startProofVersion(claims: VerifiedClaims, fileId: string) {
  return addProofVersion(claims, { fileId }, deps());
}

export function finishProofUpload(claims: VerifiedClaims, versionId: string) {
  return confirmProofVersion(claims, { versionId }, deps());
}

export function commentOnProof(
  claims: VerifiedClaims,
  input: {
    versionId: string;
    body: string;
    anchor?: unknown;
    internal?: boolean;
    parentId?: string | null;
  },
) {
  return addProofComment(claims, input, deps());
}

export function resolveComment(claims: VerifiedClaims, commentId: string, resolved: boolean) {
  return resolveProofComment(claims, { commentId, resolved }, deps());
}

export function askProofApproval(claims: VerifiedClaims, versionId: string) {
  return requestVersionApproval(claims, { versionId }, deps());
}

export function decideProof(
  claims: VerifiedClaims,
  input: { approvalId: string; decision: 'approved' | 'changes_requested'; comment: string },
) {
  return decideFileApproval(claims, input, deps());
}

export function saveRevisionLimit(claims: VerifiedClaims, projectId: string, limit: number) {
  return setRevisionLimit(claims, { projectId, limit }, deps());
}

export { PROOFING_FUNCTIONS } from './automations';
