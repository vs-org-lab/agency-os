import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import type { LibraryStorage } from '@/modules/library';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { FAKE_PROPOSAL } from '@/platform/receipt-reader';
import type { MoneyDeps } from './access';

export const MONEY_TEST_NOW = new Date('2026-10-14T10:00:00Z');

export const PNG_RECEIPT = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

export const PDF_RECEIPT = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');

export function moneyClaims(
  userId: string,
  userKind: 'internal' | 'client' = 'internal',
): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: userKind,
  };
}

function memoryStorage(): LibraryStorage & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    createUploadUrl: async (path) => `memory://upload/${path}`,
    download: async (path) => files.get(path) ?? null,
    exists: async (path) => files.has(path),
    signedDownloadUrl: async (path, ttlSeconds, fileName) =>
      `memory://file/${path}?ttl=${ttlSeconds}&download=${encodeURIComponent(fileName)}`,
    signedUrl: async (path, ttlSeconds) => `memory://file/${path}?ttl=${ttlSeconds}`,
    upload: async (path, bytes) => {
      files.set(path, bytes);
    },
    remove: async (path) => {
      files.delete(path);
    },
    removeMany: async (paths) => {
      for (const path of paths) files.delete(path);
    },
  };
}

export function moneyDeps(sql: TransactionSql) {
  const storage = memoryStorage();
  const reads: string[] = [];
  const deps: MoneyDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    reader: {
      read: async (_image, mimeType) => {
        reads.push(mimeType);
        return { ...FAKE_PROPOSAL };
      },
    },
    now: () => MONEY_TEST_NOW,
  };
  return { deps, storage, reads };
}
