export type EvidenceStorage = {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
};

export const EVIDENCE_URL_TTL_SECONDS = 300;
