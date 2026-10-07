import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { consumeThrottle, hashForThrottle } from './throttle';

afterAll(async () => {
  await closeTestSql();
});

const SECRET = 'a-secret-that-is-long-enough-for-hmac-signing';
const NOW = new Date('2026-10-07T12:10:00Z');

describe('consumeThrottle', () => {
  it('allows up to the limit within a window', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withSystemContext } = createDbContexts(testDatabase(sql));
      const input = {
        organizationId: world.organizationId,
        kind: 'application_email' as const,
        key: 'ana@empresa.pt',
        limit: 3,
        windowSeconds: 86_400,
        now: NOW,
        secret: SECRET,
      };

      const results = await withSystemContext(async (tx) => [
        await consumeThrottle(tx, input),
        await consumeThrottle(tx, input),
        await consumeThrottle(tx, input),
      ]);
      expect(results).toEqual([true, true, true]);
    });
  });

  it('blocks above the limit', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withSystemContext } = createDbContexts(testDatabase(sql));
      const input = {
        organizationId: world.organizationId,
        kind: 'application_ip' as const,
        key: '203.0.113.7',
        limit: 2,
        windowSeconds: 3_600,
        now: NOW,
        secret: SECRET,
      };

      const results = await withSystemContext(async (tx) => [
        await consumeThrottle(tx, input),
        await consumeThrottle(tx, input),
        await consumeThrottle(tx, input),
      ]);
      expect(results).toEqual([true, true, false]);
    });
  });

  it('resets in the next window', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withSystemContext } = createDbContexts(testDatabase(sql));
      const input = {
        organizationId: world.organizationId,
        kind: 'application_ip' as const,
        key: '203.0.113.7',
        limit: 1,
        windowSeconds: 3_600,
        now: NOW,
        secret: SECRET,
      };

      const results = await withSystemContext(async (tx) => [
        await consumeThrottle(tx, input),
        await consumeThrottle(tx, input),
        await consumeThrottle(tx, { ...input, now: new Date('2026-10-07T13:00:00Z') }),
      ]);
      expect(results).toEqual([true, false, true]);
    });
  });

  it('stores only hashed keys', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withSystemContext } = createDbContexts(testDatabase(sql));
      await withSystemContext((tx) =>
        consumeThrottle(tx, {
          organizationId: world.organizationId,
          kind: 'application_email',
          key: 'ana@empresa.pt',
          limit: 3,
          windowSeconds: 86_400,
          now: NOW,
          secret: SECRET,
        }),
      );

      const rows = await sql<{ key_hash: string }[]>`
        select key_hash from public.submission_throttle where organization_id = ${world.organizationId}
      `;
      expect(rows).toEqual([{ key_hash: hashForThrottle('ana@empresa.pt', SECRET) }]);
      expect(rows[0]?.key_hash).not.toContain('ana');
    });
  });
});
