import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import type { LibraryStorage } from '@/modules/library';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { DocumentsDeps } from './access';

export const DOCUMENTS_TEST_NOW = new Date('2026-10-12T09:00:00Z');

export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

export function documentClaims(
  userId: string,
  userKind: 'internal' | 'client' = 'internal',
): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: userKind === 'internal' ? 'aal2' : 'aal1',
    session_id: randomUUID(),
    amr: [
      {
        method: userKind === 'internal' ? 'totp' : 'otp',
        timestamp: Math.floor(Date.now() / 1000),
      },
    ],
    user_kind: userKind,
  };
}

function memoryStorage(): LibraryStorage & { files: Map<string, Uint8Array>; removed: string[] } {
  const files = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const remove = async (path: string) => {
    files.delete(path);
    removed.push(path);
  };
  return {
    files,
    removed,
    createUploadUrl: async (path) => `memory://upload/${path}`,
    download: async (path) => files.get(path) ?? null,
    signedDownloadUrl: async (path, ttlSeconds, fileName) =>
      `memory://file/${path}?ttl=${ttlSeconds}&download=${encodeURIComponent(fileName)}`,
    signedUrl: async (path, ttlSeconds) => `memory://file/${path}?ttl=${ttlSeconds}`,
    remove,
    removeMany: async (paths) => {
      for (const path of paths) await remove(path);
    },
  };
}

export function documentsDeps(sql: TransactionSql) {
  const storage = memoryStorage();
  const flushes: number[] = [];
  const deps: DocumentsDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    flush: async () => {
      flushes.push(1);
    },
    now: () => DOCUMENTS_TEST_NOW,
  };
  return { deps, storage, flushes };
}
