import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createAuthUser,
  createFixtureWorld,
  withTestTransaction,
} from '../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function insertAuditRow(sql: TransactionSql, organizationId: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.audit_log (organization_id, actor_kind, action, resource_type)
    values (${organizationId}, 'system', 'fixture.created', 'organization')
    returning id
  `;
  if (!row) throw new Error('Audit row was not created');
  return row.id;
}

async function attempt(sql: TransactionSql, statement: () => Promise<unknown>): Promise<string> {
  await sql`savepoint attempt`;
  try {
    await statement();
    return 'succeeded';
  } catch (error) {
    return (error as Error).message;
  } finally {
    await sql`rollback to savepoint attempt`;
  }
}

describe('audit log is append-only', () => {
  it('update on audit_log fails for every role including postgres', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const id = await insertAuditRow(sql, world.organizationId);

      const asPostgres = await attempt(
        sql,
        () => sql`update public.audit_log set action = 'tampered' where id = ${id}`,
      );
      expect(asPostgres).toMatch(/audit_log is append-only/);

      const asFounder = await attempt(sql, async () => {
        await asUser(sql, world.users.founder);
        return sql`update public.audit_log set action = 'tampered' where id = ${id}`;
      });
      expect(asFounder).toMatch(/permission denied|append-only/);
    });
  });

  it('delete on audit_log fails for every role', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const id = await insertAuditRow(sql, world.organizationId);

      expect(await attempt(sql, () => sql`delete from public.audit_log where id = ${id}`)).toMatch(
        /audit_log is append-only/,
      );
      expect(await attempt(sql, () => sql`truncate public.audit_log`)).toMatch(
        /audit_log is append-only/,
      );
      expect(
        await attempt(sql, async () => {
          await asUser(sql, world.users.founder);
          return sql`delete from public.audit_log where id = ${id}`;
        }),
      ).toMatch(/permission denied|append-only/);

      const [row] = await sql<
        { action: string }[]
      >`select action from public.audit_log where id = ${id}`;
      expect(row?.action).toBe('fixture.created');
    });
  });

  it('authenticated cannot insert directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      const outcome = await attempt(sql, async () => {
        await asUser(sql, world.users.founder);
        return sql`
          insert into public.audit_log (organization_id, actor_kind, action, resource_type)
          values (${world.organizationId}, 'system', 'forged', 'organization')
        `;
      });
      expect(outcome).toMatch(/permission denied/);
    });
  });

  it('record_audit sets actor from jwt', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await asUser(sql, world.users.manager);

      const [created] = await sql<{ id: string }[]>`
        select app.record_audit(${world.organizationId}, 'auth.sign_in', 'session', null, null,
          '{}'::jsonb, '203.0.113.7'::inet, 'vitest', 'system') as id
      `;
      await asSystem(sql);
      const [row] = await sql<{ actor_user_id: string; actor_kind: string; ip_address: string }[]>`
        select actor_user_id, actor_kind, host(ip_address) as ip_address
        from public.audit_log where id = ${created?.id ?? ''}
      `;

      expect(row).toEqual({
        actor_user_id: world.users.manager,
        actor_kind: 'user',
        ip_address: '203.0.113.7',
      });
    });
  });

  it('record_audit records system actor when there is no authenticated user', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);

      const [created] = await sql<{ id: string }[]>`
        select app.record_audit(${world.organizationId}, 'invitation.created', 'membership', null,
          null, '{}'::jsonb, null, null, 'user') as id
      `;
      const [row] = await sql<{ actor_user_id: string | null; actor_kind: string }[]>`
        select actor_user_id, actor_kind from public.audit_log where id = ${created?.id ?? ''}
      `;

      expect(row).toEqual({ actor_user_id: null, actor_kind: 'system' });
    });
  });

  it('record_audit rejects callers outside the organization', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const outsider = await createAuthUser(sql, { fullName: 'Outsider', kind: 'internal' });

      const outcome = await attempt(sql, async () => {
        await asUser(sql, outsider);
        return sql`
          select app.record_audit(${world.organizationId}, 'auth.sign_in', 'session', null, null,
            '{}'::jsonb, null, null, 'user')
        `;
      });
      expect(outcome).toMatch(/not a member of the organization/);
    });
  });
});
