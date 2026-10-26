import type { BucketStorage } from './bucket-storage';

export type MemoryBucketStorage = BucketStorage & {
  files: Map<string, Uint8Array>;
  put(path: string, bytes: Uint8Array): void;
};

export function createMemoryBucketStorage(): MemoryBucketStorage {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    put(path, bytes) {
      files.set(path, bytes);
    },
    async createUploadUrl(path) {
      return `memory://upload/${path}`;
    },
    async objectSize(path) {
      return files.get(path)?.byteLength ?? null;
    },
    async download(path) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`Object ${path} was not found`);
      return bytes;
    },
    async signedUrl(path, ttlSeconds) {
      return `memory://file/${path}?ttl=${ttlSeconds}`;
    },
    async remove(paths) {
      for (const path of paths) files.delete(path);
    },
  };
}
