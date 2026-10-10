import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { ProofingDeps } from './files';
import type { ProofStorage } from './storage';

export const PROOFING_TEST_NOW = new Date('2026-10-12T09:00:00Z');

export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

export function proofClaims(
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

export function memoryProofStorage(): ProofStorage & {
  files: Map<string, Uint8Array>;
  removed: string[];
} {
  const files = new Map<string, Uint8Array>();
  const removed: string[] = [];
  return {
    files,
    removed,
    async createUploadUrl(path) {
      return `memory://upload/${path}`;
    },
    async download(path) {
      return files.get(path) ?? null;
    },
    async signedUrl(path, ttlSeconds) {
      return `memory://file/${path}?ttl=${ttlSeconds}`;
    },
    async remove(path) {
      files.delete(path);
      removed.push(path);
    },
  };
}

export function proofingDeps(sql: TransactionSql) {
  const storage = memoryProofStorage();
  const deps: ProofingDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    now: () => PROOFING_TEST_NOW,
  };
  return { deps, storage };
}
