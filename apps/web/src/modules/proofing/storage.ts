export type ProofStorage = {
  createUploadUrl(path: string): Promise<string>;
  download(path: string): Promise<Uint8Array | null>;
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
};

export const PROOFS_BUCKET = 'proofs';

/** The bucket limit (free plan, ADR 0003). */
export const MAX_PROOF_BYTES = 52_428_800;

/** SEC-31: files are served by links that expire in 15 minutes. */
export const PROOF_LINK_TTL_SECONDS = 900;

export function proofPath(input: {
  organizationId: string;
  clientId: string;
  projectId: string;
  fileId: string;
  versionId: string;
}): string {
  return [
    input.organizationId,
    input.clientId,
    input.projectId,
    input.fileId,
    input.versionId,
  ].join('/');
}
