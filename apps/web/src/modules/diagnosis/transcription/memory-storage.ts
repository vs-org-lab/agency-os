import type { RecordingStorage } from './storage';

export type MemoryRecordingStorage = RecordingStorage & {
  files: Map<string, Uint8Array>;
  put(path: string, bytes: Uint8Array): void;
};

export function createMemoryRecordingStorage(): MemoryRecordingStorage {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    put(path, bytes) {
      files.set(path, bytes);
    },
    async createUploadUrl(path) {
      return `memory://upload/${path}`;
    },
    async exists(path) {
      return files.has(path);
    },
    async download(path) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`Recording ${path} was not found`);
      return bytes;
    },
    async remove(paths) {
      for (const path of paths) files.delete(path);
    },
  };
}
