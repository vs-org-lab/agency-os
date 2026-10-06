import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, withTestTransaction } from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

describe('rls coverage', () => {
  it('every public table with organization_id or client_id has rls enabled and at least one policy', async () => {
    await withTestTransaction(async (sql) => {
      const rows = await sql<
        { table_name: string; rls: boolean; forced: boolean; policies: number }[]
      >`
        select c.relname as table_name,
               c.relrowsecurity as rls,
               c.relforcerowsecurity as forced,
               (select count(*)::int from pg_policies p
                 where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and exists (
            select 1 from information_schema.columns col
            where col.table_schema = 'public' and col.table_name = c.relname
              and col.column_name in ('organization_id', 'client_id')
          )
      `;

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.rls, `${row.table_name} rls`).toBe(true);
        expect(row.forced, `${row.table_name} forced`).toBe(true);
        expect(row.policies, `${row.table_name} policies`).toBeGreaterThan(0);
      }
    });
  });

  it('access functions are security definer with an empty search_path', async () => {
    await withTestTransaction(async (sql) => {
      const rows = await sql<{ name: string; definer: boolean; config: string[] | null }[]>`
        select p.proname as name, p.prosecdef as definer, p.proconfig as config
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app'
          and p.proname in ('is_mfa_verified', 'has_org_role', 'is_org_member', 'has_client_access')
      `;

      expect(rows.map((row) => row.name).sort()).toEqual(
        ['has_client_access', 'has_org_role', 'is_mfa_verified', 'is_org_member'].sort(),
      );
      for (const row of rows) {
        expect(row.definer, row.name).toBe(true);
        expect(row.config ?? [], row.name).toContain('search_path=""');
      }
    });
  });
});
