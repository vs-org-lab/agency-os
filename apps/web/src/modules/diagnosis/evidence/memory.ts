import type { EvidenceStorage } from './port';

export type MemoryEvidenceStorage = EvidenceStorage & {
  files: Map<string, { bytes: Uint8Array; contentType: string }>;
};

export function createMemoryEvidenceStorage(): MemoryEvidenceStorage {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    files,
    async upload(path, bytes, contentType) {
      files.set(path, { bytes, contentType });
    },
    async signedUrl(path, ttlSeconds) {
      if (!files.has(path)) throw new Error(`Evidence ${path} was not found`);
      return `memory://${path}?ttl=${ttlSeconds}`;
    },
    async remove(path) {
      files.delete(path);
    },
  };
}
