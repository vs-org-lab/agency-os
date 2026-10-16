import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { ReportsDeps } from './access';

export function reportsClaims(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: 'internal',
  };
}

export function reportsDeps(sql: TransactionSql, now: Date = new Date()): ReportsDeps {
  return { contexts: createDbContexts(testDatabase(sql)), now: () => now };
}
