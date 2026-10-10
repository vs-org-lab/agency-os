import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { testDatabase } from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import type { TasksDeps } from './service';

export const TASKS_TEST_NOW = new Date('2026-10-12T09:00:00Z');

export function taskClaims(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: 'internal',
  };
}

export function taskDeps(sql: TransactionSql, overrides: Partial<TasksDeps> = {}) {
  const deps: TasksDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    now: () => TASKS_TEST_NOW,
    ...overrides,
  };
  return { deps };
}
