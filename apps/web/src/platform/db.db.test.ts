import { randomUUID } from 'node:crypto';
import { sql as dsql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from './db';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string, aal: 'aal1' | 'aal2' = 'aal2'): VerifiedClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: userId,
    role: 'authenticated',
    aal,
    session_id: randomUUID(),
    amr:
      aal === 'aal2'
        ? [{ method: 'totp', timestamp: now }]
        : [{ method: 'password', timestamp: now }],
  };
}

describe('database contexts', () => {
  it('withUserContext runs as authenticated with given claims', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const identity = await withUserContext(claimsFor(world.users.manager), async (tx) => {
        const rows = await tx.execute<{ role: string; uid: string }>(
          dsql`select current_user as role, auth.uid()::text as uid`,
        );
        return rows[0];
      });

      expect(identity).toEqual({ role: 'authenticated', uid: world.users.manager });
    });
  });

  it('withUserContext cannot read other client rows', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const visible = await withUserContext(claimsFor(world.users.decisionMakerA), async (tx) => {
        const rows = await tx.execute<{ id: string }>(dsql`select id from public.clients`);
        return rows.map((row) => row.id);
      });

      expect(visible).toEqual([world.clients.a]);
    });
  });

  it('withSystemContext bypasses rls and clears user claims', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withUserContext, withSystemContext } = createDbContexts(testDatabase(sql));
      await withUserContext(claimsFor(world.users.operationalA), async () => undefined);

      const result = await withSystemContext(async (tx) => {
        const clients = await tx.execute<{ id: string }>(
          dsql`select id from public.clients where organization_id = ${world.organizationId}`,
        );
        const [identity] = await tx.execute<{ uid: string | null }>(
          dsql`select auth.uid()::text as uid`,
        );
        return { clientIds: clients.map((row) => row.id).sort(), uid: identity?.uid ?? null };
      });

      expect(result).toEqual({
        clientIds: [world.clients.a, world.clients.b].sort(),
        uid: null,
      });
    });
  });

  it('withUserContext rejects claims that are not for an authenticated subject', async () => {
    await withTestTransaction(async (sql) => {
      const { withUserContext } = createDbContexts(testDatabase(sql));

      await expect(
        withUserContext({ ...claimsFor(randomUUID()), sub: 'not-a-uuid' }, async () => undefined),
      ).rejects.toThrow(/Invalid claims/);
    });
  });

  it('a preview context reads the client portal read-only and keeps the staff identity', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));
      await sql`savepoint preview_context`;

      const preview = { ...claimsFor(world.users.founder), preview_client: world.clients.a };
      const seen = await withUserContext(preview, async (tx) => {
        const projects = await tx.execute<{ id: string }>(
          dsql`select id from public.portal_projects`,
        );
        const [identity] = await tx.execute<{ uid: string; readOnly: string }>(
          dsql`select auth.uid()::text as uid, current_setting('transaction_read_only') as "readOnly"`,
        );
        return { projectIds: projects.map((row) => row.id), ...identity };
      });
      expect(seen).toEqual({
        projectIds: [rooms.a.projectId],
        uid: world.users.founder,
        readOnly: 'on',
      });

      await expect(
        withUserContext(preview, (tx) =>
          tx.execute(dsql`update public.clients set name = name where id = ${world.clients.a}`),
        ),
      ).rejects.toThrow();
      await sql`rollback to savepoint preview_context`;
    });
  });
});
