import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { OutcomesDeps } from './access';

export function outcomeClaims(
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

export function outcomeDeps(sql: TransactionSql) {
  const flushes: number[] = [];
  const deps: OutcomesDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    flush: async () => {
      flushes.push(1);
    },
  };
  return { deps, flushes };
}

/** Today in Lisbon, as the database fixtures see it. */
export function lisbonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

export function inDays(days: number): string {
  const date = new Date(`${lisbonToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
