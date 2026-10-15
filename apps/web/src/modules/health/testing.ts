import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { HealthDeps } from './access';

/** The instant the health tests read at: Lisbon's 15 October 2026, in the morning. */
export const HEALTH_TEST_NOW = new Date('2026-10-15T10:00:00Z');

export function healthClaims(
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

export function healthDeps(sql: TransactionSql, now: Date = HEALTH_TEST_NOW) {
  const flushes: number[] = [];
  const deps: HealthDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    now: () => now,
    flush: async () => {
      flushes.push(1);
    },
  };
  return { deps, flushes };
}
