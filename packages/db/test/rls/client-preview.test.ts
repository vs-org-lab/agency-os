import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

/** Runs `fn` in a savepoint with the preview set, so the read-only mode ends with it. */
async function inPreview<T>(
  sql: TransactionSql,
  clientId: string,
  fn: () => Promise<T>,
  options: { readOnly?: boolean; role?: string } = {},
): Promise<T> {
  await sql`savepoint preview`;
  try {
    await sql`select set_config('app.preview_client', ${clientId}, true)`;
    if (options.role) await sql`select set_config('app.preview_role', ${options.role}, true)`;
    if (options.readOnly !== false) {
      await sql`select set_config('transaction_read_only', 'on', true)`;
    }
    return await fn();
  } finally {
    await sql`rollback to savepoint preview`;
  }
}

async function portalProjectIds(sql: TransactionSql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from public.portal_projects`;
  return rows.map((row) => row.id).sort();
}

describe('client preview', () => {
  it('founder and assigned manager read the portal views of the previewed client only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);

      for (const user of [world.users.founder, world.users.manager]) {
        await asUser(sql, user);
        expect(await portalProjectIds(sql)).toEqual([]);
        expect(await inPreview(sql, world.clients.a, () => portalProjectIds(sql))).toEqual([
          rooms.a.projectId,
        ]);
        const steps = await inPreview(
          sql,
          world.clients.a,
          () => sql<{ id: string }[]>`select id from public.portal_project_steps`,
        );
        expect(steps.map((row) => row.id)).toEqual([rooms.a.visibleStepId]);
        await asSystem(sql);
      }
    });
  });

  it('grants nothing outside a read-only transaction', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createRoomFixture(sql, world);

      await asUser(sql, world.users.founder);
      expect(
        await inPreview(sql, world.clients.a, () => portalProjectIds(sql), { readOnly: false }),
      ).toEqual([]);
      const [member] = await inPreview(
        sql,
        world.clients.a,
        () => sql<{ member: boolean }[]>`
          select app.is_client_member(${world.clients.a}::uuid, null) as member
        `,
        { readOnly: false },
      );
      expect(member?.member).toBe(false);
    });
  });

  it('refuses staff who cannot preview the client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${rooms.a.projectId},
                ${world.users.freelancer})
      `;

      for (const [user, clientId, own] of [
        [world.users.manager, world.clients.b, []],
        [world.users.freelancer, world.clients.a, []],
        [world.users.finance, world.clients.a, []],
        [world.users.decisionMakerA, world.clients.b, [rooms.a.projectId]],
      ] as const) {
        await asUser(sql, user);
        expect(await inPreview(sql, clientId, () => portalProjectIds(sql))).toEqual(own);
        await asSystem(sql);
      }
    });
  });

  it('previews as the decision maker, never as an operational-only role', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      await asUser(sql, world.users.founder);
      const [roles] = await inPreview(
        sql,
        world.clients.a,
        () => sql<{ decides: boolean; finance: boolean; operational: boolean }[]>`
          select
            app.is_client_member(${world.clients.a}::uuid, array['decision_maker']::app.client_role[]) as decides,
            app.is_client_member(${world.clients.a}::uuid, array['client_finance']::app.client_role[]) as finance,
            app.is_client_member(${world.clients.a}::uuid, array['operational']::app.client_role[]) as operational
        `,
      );
      expect(roles).toEqual({ decides: true, finance: false, operational: false });
    });
  });

  it('client members keep their own access unchanged', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);

      await asUser(sql, world.users.decisionMakerA);
      expect(await portalProjectIds(sql)).toEqual([rooms.a.projectId]);
    });
  });

  it('previews as the role the team chose', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const roles = (role: string) =>
        inPreview(
          sql,
          world.clients.a,
          () => sql<{ decides: boolean; finance: boolean; operational: boolean }[]>`
            select
              app.is_client_member(${world.clients.a}::uuid, array['decision_maker']::app.client_role[]) as decides,
              app.is_client_member(${world.clients.a}::uuid, array['client_finance']::app.client_role[]) as finance,
              app.is_client_member(${world.clients.a}::uuid, array['operational']::app.client_role[]) as operational
          `,
          { role },
        );

      await asUser(sql, world.users.founder);
      expect((await roles('operational'))[0]).toEqual({
        decides: false,
        finance: false,
        operational: true,
      });
      expect((await roles('client_finance'))[0]).toEqual({
        decides: false,
        finance: true,
        operational: false,
      });
      expect((await roles('unknown'))[0]).toEqual({
        decides: false,
        finance: false,
        operational: false,
      });
    });
  });
});
