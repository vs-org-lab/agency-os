import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import type { LibraryStorage } from '@/modules/library';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { ClientReportsDeps } from './access';

/** 12 October 2026 in Lisbon: September and the third quarter have ended. */
export const REPORTS_TEST_NOW = new Date('2026-10-12T09:00:00Z');

export function reportClaims(
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

function memoryStorage(): LibraryStorage & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    createUploadUrl: async (path) => `memory://upload/${path}`,
    download: async (path) => files.get(path) ?? null,
    exists: async (path) => files.has(path),
    signedDownloadUrl: async (path) => `memory://file/${path}`,
    signedUrl: async (path) => `memory://file/${path}`,
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

export function reportDeps(sql: TransactionSql, now: Date = REPORTS_TEST_NOW) {
  const storage = memoryStorage();
  const deps: ClientReportsDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    flush: async () => {},
    now: () => now,
  };
  return { deps, storage };
}
