import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asAnonymous,
  asSystem,
  asUser,
  closeTestSql,
  createCommercialFixture,
  createFixtureWorld,
  withTestTransaction,
  type World,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

type ClientScopedTable = {
  table: string;
  clientColumn: string;
};

const clientScopedTables: ClientScopedTable[] = [
  { table: 'clients', clientColumn: 'id' },
  { table: 'client_memberships', clientColumn: 'client_id' },
  { table: 'client_staff_assignments', clientColumn: 'client_id' },
  { table: 'audit_log', clientColumn: 'client_id' },
  { table: 'domain_events', clientColumn: 'client_id' },
  { table: 'contacts', clientColumn: 'client_id' },
  { table: 'applications', clientColumn: 'client_id' },
  { table: 'deals', clientColumn: 'client_id' },
  { table: 'deal_stage_changes', clientColumn: 'client_id' },
  { table: 'calls', clientColumn: 'client_id' },
  { table: 'follow_ups', clientColumn: 'client_id' },
  { table: 'timeline_entries', clientColumn: 'client_id' },
];

async function seedClientScopedRows(sql: TransactionSql, world: World): Promise<void> {
  await createCommercialFixture(sql, world);
  for (const clientId of [world.clients.a, world.clients.b]) {
    await sql`
      insert into public.audit_log (organization_id, actor_kind, action, resource_type, client_id)
      values (${world.organizationId}, 'system', 'fixture.created', 'client', ${clientId})
    `;
    await sql`
      insert into public.domain_events (organization_id, client_id, type)
      values (${world.organizationId}, ${clientId}, 'fixture.created')
    `;
  }
  await sql`
    insert into public.client_staff_assignments (organization_id, client_id, user_id)
    values (${world.organizationId}, ${world.clients.b}, ${world.users.finance})
  `;
}

async function countVisible(sql: TransactionSql, target: ClientScopedTable, clientId: string) {
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count from ${sql('public.' + target.table)}
    where ${sql(target.clientColumn)} = ${clientId}
  `.catch((error: Error) => {
    if (/permission denied/.test(error.message)) return [{ count: 0 }];
    throw error;
  });
  return rows[0]?.count ?? 0;
}

describe('cross-client isolation', () => {
  for (const target of clientScopedTables) {
    it(`client A user cannot select, update or delete client B rows in ${target.table}`, async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await seedClientScopedRows(sql, world);
        const before = await countVisible(sql, target, world.clients.b);
        expect(before).toBeGreaterThan(0);

        for (const userId of [world.users.decisionMakerA, world.users.operationalA]) {
          await sql`savepoint probe`;
          await asUser(sql, userId);

          expect(await countVisible(sql, target, world.clients.b)).toBe(0);

          const updated = await sql`
            update ${sql('public.' + target.table)} set ${sql(target.clientColumn)} = ${sql(target.clientColumn)}
            where ${sql(target.clientColumn)} = ${world.clients.b}
          `.catch(() => ({ count: 0 }));
          expect(updated.count).toBe(0);

          const deleted = await sql`
            delete from ${sql('public.' + target.table)}
            where ${sql(target.clientColumn)} = ${world.clients.b}
          `.catch(() => ({ count: 0 }));
          expect(deleted.count).toBe(0);

          await sql`rollback to savepoint probe`;
          await asSystem(sql);
        }

        expect(await countVisible(sql, target, world.clients.b)).toBe(before);
      });
    });
  }

  it('client B user sees nothing of client A', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await seedClientScopedRows(sql, world);
      await asUser(sql, world.users.clientFinanceB, { aal: 'aal1' });

      for (const target of clientScopedTables) {
        await sql`savepoint probe`;
        expect(await countVisible(sql, target, world.clients.a), target.table).toBe(0);
        await sql`rollback to savepoint probe`;
      }
    });
  });

  it('anonymous role reads nothing from any foundation table', async () => {
    await withTestTransaction(async (sql) => {
      await createFixtureWorld(sql);

      for (const table of [
        'organizations',
        'profiles',
        'organization_memberships',
        ...clientScopedTables.map((target) => target.table),
      ]) {
        await sql`savepoint probe`;
        await asAnonymous(sql);
        const outcome = await sql`select count(*)::int as count from ${sql('public.' + table)}`
          .then((rows) => ({ denied: false, count: (rows[0]?.count as number | undefined) ?? 0 }))
          .catch((error: Error) => ({ denied: /permission denied/.test(error.message), count: 0 }));
        await sql`rollback to savepoint probe`;

        expect(outcome.denied || outcome.count === 0, table).toBe(true);
        expect(outcome.count, table).toBe(0);
      }
    });
  });
});
