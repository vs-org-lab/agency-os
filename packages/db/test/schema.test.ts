import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createAuthUser,
  createFixtureWorld,
  withTestTransaction,
} from '../src/testing';

const foundationTables = [
  'organizations',
  'profiles',
  'organization_memberships',
  'clients',
  'client_memberships',
  'client_staff_assignments',
  'audit_log',
  'domain_events',
];

afterAll(async () => {
  await closeTestSql();
});

describe('foundation schema', () => {
  it('every foundation table exists with uuid primary key defaulting to gen_random_uuid', async () => {
    await withTestTransaction(async (sql) => {
      const columns = await sql<
        { table_name: string; data_type: string; column_default: string | null }[]
      >`
        select c.table_name, c.data_type, c.column_default
        from information_schema.columns c
        join information_schema.key_column_usage k
          on k.table_schema = c.table_schema and k.table_name = c.table_name and k.column_name = c.column_name
        join information_schema.table_constraints t
          on t.constraint_name = k.constraint_name and t.table_schema = k.table_schema
        where c.table_schema = 'public' and t.constraint_type = 'PRIMARY KEY' and c.column_name = 'id'
      `;
      const byTable = new Map(columns.map((column) => [column.table_name, column]));

      for (const table of foundationTables) {
        const column = byTable.get(table);
        expect(column, table).toBeDefined();
        expect(column?.data_type, table).toBe('uuid');
        if (table !== 'profiles') {
          expect(column?.column_default, table).toBe('gen_random_uuid()');
        }
      }
    });
  });

  it('audit_log has no updated_at and no archived_at', async () => {
    await withTestTransaction(async (sql) => {
      const rows = await sql<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log'
      `;
      const names = rows.map((row) => row.column_name);

      expect(names).toContain('occurred_at');
      expect(names).not.toContain('updated_at');
      expect(names).not.toContain('archived_at');
    });
  });

  it('organization_memberships rejects duplicate organization and user', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      await expect(
        sql`
          insert into public.organization_memberships (organization_id, user_id, role, status)
          values (${world.organizationId}, ${world.users.founder}, 'finance', 'active')
        `,
      ).rejects.toThrow(/duplicate key/);
    });
  });

  it('client_memberships rejects a client from another organization', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const [other] = await sql<{ id: string }[]>`
        insert into public.organizations (name, slug) values ('Other', ${`other-${world.organizationId}`})
        returning id
      `;
      const outsider = await createAuthUser(sql, { fullName: 'Outsider', kind: 'client' });

      await expect(
        sql`
          insert into public.client_memberships (organization_id, client_id, user_id, role, status)
          values (${other?.id ?? ''}, ${world.clients.a}, ${outsider}, 'operational', 'active')
        `,
      ).rejects.toThrow(/foreign key/);
    });
  });

  it('asUser runs as authenticated with the given subject and assurance level', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await asUser(sql, world.users.founder, { aal: 'aal1' });

      const [row] = await sql<{ role: string; sub: string; aal: string }[]>`
        select current_user as role,
               current_setting('request.jwt.claims', true)::json ->> 'sub' as sub,
               current_setting('request.jwt.claims', true)::json ->> 'aal' as aal
      `;

      expect(row).toEqual({ role: 'authenticated', sub: world.users.founder, aal: 'aal1' });
    });
  });

  it('test transactions leave no rows behind', async () => {
    let organizationId = '';
    await withTestTransaction(async (sql) => {
      organizationId = (await createFixtureWorld(sql)).organizationId;
    });

    await withTestTransaction(async (sql) => {
      const rows = await sql`select 1 from public.organizations where id = ${organizationId}`;
      expect(rows).toHaveLength(0);
    });
  });
});
