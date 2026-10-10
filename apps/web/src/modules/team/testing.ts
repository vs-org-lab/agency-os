import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { TeamDeps } from './service';

export const TEAM_TEST_NOW = new Date('2026-10-14T09:00:00Z');

/** Claims whose last TOTP check happened `mfaAgeMinutes` before `TEAM_TEST_NOW`. */
export function teamClaims(userId: string, mfaAgeMinutes = 1): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [
      {
        method: 'totp',
        timestamp: Math.floor((TEAM_TEST_NOW.getTime() - mfaAgeMinutes * 60_000) / 1000),
      },
    ],
    user_kind: 'internal',
  };
}

export function teamDeps(sql: TransactionSql): TeamDeps {
  return { contexts: createDbContexts(testDatabase(sql)), now: () => TEAM_TEST_NOW };
}
