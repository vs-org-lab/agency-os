import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import type { DbTransaction } from '@agency-os/db';
import { testDatabase } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { RoomsDeps } from './runtime-types';

export const ROOMS_TEST_NOW = new Date('2026-10-12T09:00:00Z');

export function roomClaims(
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

export function roomDeps(sql: TransactionSql, overrides: Partial<RoomsDeps> = {}) {
  const moves: Array<{ dealId: string; code: string }> = [];
  const deps: RoomsDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    moveDeal: async (_tx: DbTransaction, dealId: string, code: string) => {
      moves.push({ dealId, code });
    },
    flush: async () => {},
    now: () => ROOMS_TEST_NOW,
    ...overrides,
  };
  return { deps, moves };
}
