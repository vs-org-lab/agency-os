import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createFixtureWorld,
  withTestTransaction,
} from '../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function createSession(
  sql: TransactionSql,
  userId: string,
  userAgent: string,
): Promise<string> {
  const id = randomUUID();
  await sql`
    insert into auth.sessions (id, user_id, created_at, updated_at, aal, user_agent, ip)
    values (${id}, ${userId}, now(), now(), 'aal2', ${userAgent}, '198.51.100.10')
  `;
  return id;
}

describe('session functions', () => {
  it('lists only own sessions and marks current', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const current = await createSession(sql, world.users.manager, 'Laptop');
      const other = await createSession(sql, world.users.manager, 'Phone');
      await createSession(sql, world.users.founder, 'Founder laptop');
      await asUser(sql, world.users.manager, { sessionId: current });

      const rows = await sql<{ id: string; user_agent: string; is_current: boolean; ip: string }[]>`
        select id, user_agent, is_current, host(ip) as ip from app.list_my_sessions()
      `;

      expect(rows.map((row) => row.id).sort()).toEqual([current, other].sort());
      expect(rows.find((row) => row.id === current)?.is_current).toBe(true);
      expect(rows.find((row) => row.id === other)?.is_current).toBe(false);
      expect(rows[0]?.ip).toBe('198.51.100.10');
    });
  });

  it("cannot revoke another user's session", async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const founderSession = await createSession(sql, world.users.founder, 'Founder laptop');
      await asUser(sql, world.users.manager);

      const [result] = await sql<{ revoked: boolean }[]>`
        select app.revoke_my_session(${founderSession}) as revoked
      `;
      await asSystem(sql);
      const remaining = await sql`select 1 from auth.sessions where id = ${founderSession}`;

      expect(result?.revoked).toBe(false);
      expect(remaining).toHaveLength(1);
    });
  });

  it('revokes an own session', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const phone = await createSession(sql, world.users.manager, 'Phone');
      await asUser(sql, world.users.manager);

      const [result] = await sql<
        { revoked: boolean }[]
      >`select app.revoke_my_session(${phone}) as revoked`;
      await asSystem(sql);
      const remaining = await sql`select 1 from auth.sessions where id = ${phone}`;

      expect(result?.revoked).toBe(true);
      expect(remaining).toHaveLength(0);
    });
  });

  it('anonymous callers cannot execute the session functions', async () => {
    await withTestTransaction(async (sql) => {
      const rows = await sql<{ fn: string; allowed: boolean }[]>`
        select f.fn, has_function_privilege('anon', f.fn, 'execute') as allowed
        from (values ('app.list_my_sessions()'), ('app.revoke_my_session(uuid)')) as f(fn)
      `;
      expect(rows.every((row) => !row.allowed)).toBe(true);
    });
  });
});
