import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '../src/testing';

afterAll(async () => {
  await closeTestSql();
});

describe('custom access token hook', () => {
  it('adds user_kind from the profile and keeps existing claims', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      for (const [userId, kind] of [
        [world.users.founder, 'internal'],
        [world.users.decisionMakerA, 'client'],
      ] as const) {
        const event = {
          user_id: userId,
          claims: { sub: userId, aal: 'aal1' },
          authentication_method: 'password',
        };
        const [row] = await sql<{ result: { claims: Record<string, unknown> } }[]>`
          select app.custom_access_token_hook(${sql.json(event)}) as result
        `;

        expect(row?.result.claims).toEqual({ sub: userId, aal: 'aal1', user_kind: kind });
      }
    });
  });

  it('sets user_kind to null for archived or unknown profiles', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`update public.profiles set archived_at = now() where id = ${world.users.manager}`;
      const event = { user_id: world.users.manager, claims: { sub: world.users.manager } };

      const [row] = await sql<{ result: { claims: Record<string, unknown> } }[]>`
        select app.custom_access_token_hook(${sql.json(event)}) as result
      `;

      expect(row?.result.claims.user_kind).toBeNull();
    });
  });

  it('is executable by supabase_auth_admin and not by authenticated', async () => {
    await withTestTransaction(async (sql) => {
      const rows = await sql<{ role: string; allowed: boolean }[]>`
        select r.role, has_function_privilege(r.role, 'app.custom_access_token_hook(jsonb)', 'execute') as allowed
        from (values ('supabase_auth_admin'), ('authenticated'), ('anon')) as r(role)
      `;

      expect(Object.fromEntries(rows.map((row) => [row.role, row.allowed]))).toEqual({
        supabase_auth_admin: true,
        authenticated: false,
        anon: false,
      });
    });
  });
});
