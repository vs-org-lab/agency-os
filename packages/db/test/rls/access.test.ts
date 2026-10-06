import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addClientMember,
  addOrganizationMember,
  asSystem,
  asUser,
  closeTestSql,
  createAuthUser,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleClientIds(sql: TransactionSql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from public.clients`;
  return rows.map((row) => row.id);
}

describe('internal access', () => {
  it('founder without mfa sees no internal rows', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await asUser(sql, world.users.founder, { aal: 'aal1' });

      expect(await visibleClientIds(sql)).toEqual([]);
      const organizations = await sql`select id from public.organizations`;
      expect(organizations).toHaveLength(0);
      const memberships = await sql`
        select id from public.organization_memberships where user_id <> ${world.users.founder}
      `;
      expect(memberships).toHaveLength(0);
    });
  });

  it('founder with mfa sees every client of the organization', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await asUser(sql, world.users.founder);

      expect((await visibleClientIds(sql)).sort()).toEqual(
        [world.clients.a, world.clients.b].sort(),
      );
    });
  });

  it('manager sees only assigned clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await asUser(sql, world.users.manager);

      expect(await visibleClientIds(sql)).toEqual([world.clients.a]);
    });
  });

  it('dual-role user without mfa keeps client access only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await addClientMember(sql, {
        organizationId: world.organizationId,
        clientId: world.clients.b,
        userId: world.users.manager,
        role: 'operational',
      });
      await asUser(sql, world.users.manager, { aal: 'aal1' });

      expect(await visibleClientIds(sql)).toEqual([world.clients.b]);
    });
  });

  it('revoked membership loses access', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`
        update public.organization_memberships set status = 'revoked'
        where user_id = ${world.users.manager}
      `;
      await sql`
        update public.client_memberships set status = 'revoked'
        where user_id = ${world.users.decisionMakerA}
      `;

      await sql`savepoint probe`;
      await asUser(sql, world.users.manager);
      expect(await visibleClientIds(sql)).toEqual([]);
      await sql`rollback to savepoint probe`;
      await asSystem(sql);

      await asUser(sql, world.users.decisionMakerA);
      expect(await visibleClientIds(sql)).toEqual([]);
    });
  });

  it('archived client is invisible', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`update public.clients set archived_at = now() where id = ${world.clients.a}`;

      await sql`savepoint probe`;
      await asUser(sql, world.users.founder);
      expect(await visibleClientIds(sql)).toEqual([world.clients.b]);
      await sql`rollback to savepoint probe`;
      await asSystem(sql);

      await asUser(sql, world.users.decisionMakerA);
      expect(await visibleClientIds(sql)).toEqual([]);
    });
  });

  it('freelancer cannot create or rename clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await asUser(sql, world.users.freelancer);

      await sql`savepoint probe`;
      await expect(
        sql`insert into public.clients (organization_id, name) values (${world.organizationId}, 'X')`,
      ).rejects.toThrow(/row-level security/);
      await sql`rollback to savepoint probe`;

      const renamed =
        await sql`update public.clients set name = 'Renamed' where id = ${world.clients.a}`;
      expect(renamed.count).toBe(0);
    });
  });

  it('only founder reads audit_log', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`
        insert into public.audit_log (organization_id, actor_kind, action, resource_type)
        values (${world.organizationId}, 'system', 'fixture.created', 'organization')
      `;

      for (const userId of [world.users.manager, world.users.finance, world.users.decisionMakerA]) {
        await sql`savepoint probe`;
        await asUser(sql, userId);
        expect(await sql`select id from public.audit_log`, userId).toHaveLength(0);
        await sql`rollback to savepoint probe`;
        await asSystem(sql);
      }

      await asUser(sql, world.users.founder);
      expect(await sql`select id from public.audit_log`).toHaveLength(1);
    });
  });

  it('no authenticated user can read domain_events', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`
        insert into public.domain_events (organization_id, type) values (${world.organizationId}, 'fixture.created')
      `;
      await asUser(sql, world.users.founder);

      const rows = await sql`select id from public.domain_events`.catch(() => []);
      expect(rows).toHaveLength(0);
    });
  });
});

describe('client membership management', () => {
  it('decision maker can invite colleague to own client only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const colleague = await createAuthUser(sql, { fullName: 'Colleague', kind: 'client' });
      await asUser(sql, world.users.decisionMakerA, { aal: 'aal1' });

      await sql`
        insert into public.client_memberships (organization_id, client_id, user_id, role, status)
        values (${world.organizationId}, ${world.clients.a}, ${colleague}, 'operational', 'invited')
      `;

      await sql`savepoint probe`;
      await expect(
        sql`
          insert into public.client_memberships (organization_id, client_id, user_id, role, status)
          values (${world.organizationId}, ${world.clients.b}, ${colleague}, 'operational', 'invited')
        `,
      ).rejects.toThrow(/row-level security/);
      await sql`rollback to savepoint probe`;

      await expect(
        sql`
          insert into public.client_memberships (organization_id, client_id, user_id, role, status)
          values (${world.organizationId}, ${world.clients.a}, ${world.users.clientFinanceB}, 'client_finance', 'active')
        `,
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('operational cannot insert client memberships', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const colleague = await createAuthUser(sql, { fullName: 'Colleague', kind: 'client' });
      await asUser(sql, world.users.operationalA);

      await expect(
        sql`
          insert into public.client_memberships (organization_id, client_id, user_id, role, status)
          values (${world.organizationId}, ${world.clients.a}, ${colleague}, 'operational', 'invited')
        `,
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('only founder manages organization memberships', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const newcomer = await createAuthUser(sql, { fullName: 'Newcomer', kind: 'internal' });

      await sql`savepoint probe`;
      await asUser(sql, world.users.manager);
      await expect(
        sql`
          insert into public.organization_memberships (organization_id, user_id, role, status)
          values (${world.organizationId}, ${newcomer}, 'freelancer', 'invited')
        `,
      ).rejects.toThrow(/row-level security/);
      await sql`rollback to savepoint probe`;
      await asSystem(sql);

      await asUser(sql, world.users.founder);
      await sql`
        insert into public.organization_memberships (organization_id, user_id, role, status)
        values (${world.organizationId}, ${newcomer}, 'freelancer', 'invited')
      `;
    });
  });

  it('profiles are visible to people sharing an organization or client and editable only by owner', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const stranger = await createAuthUser(sql, { fullName: 'Stranger', kind: 'internal' });
      const [otherOrganization] = await sql<{ id: string }[]>`
        insert into public.organizations (name, slug) values ('Other', ${`other-${stranger}`}) returning id
      `;
      await addOrganizationMember(sql, {
        organizationId: otherOrganization?.id ?? '',
        userId: stranger,
        role: 'founder',
      });

      await sql`savepoint probe`;
      await asUser(sql, world.users.decisionMakerA);
      const seenByClient = await sql<{ id: string }[]>`select id from public.profiles`;
      const ids = seenByClient.map((row) => row.id);
      expect(ids).toContain(world.users.decisionMakerA);
      expect(ids).toContain(world.users.operationalA);
      expect(ids).toContain(world.users.manager);
      expect(ids).not.toContain(world.users.clientFinanceB);
      expect(ids).not.toContain(stranger);

      const renamedOther = await sql`
        update public.profiles set full_name = 'Changed' where id = ${world.users.operationalA}
      `;
      expect(renamedOther.count).toBe(0);
      const renamedSelf = await sql`
        update public.profiles set full_name = 'Changed' where id = ${world.users.decisionMakerA}
      `;
      expect(renamedSelf.count).toBe(1);
      await sql`rollback to savepoint probe`;

      await expect(
        sql`update public.profiles set kind = 'internal' where id = ${world.users.decisionMakerA}`,
      ).resolves.toBeDefined();
      await asUser(sql, world.users.decisionMakerA);
      await expect(
        sql`update public.profiles set kind = 'internal' where id = ${world.users.decisionMakerA}`,
      ).rejects.toThrow(/permission denied/);
    });
  });
});

describe('archived organizations and clients', () => {
  it('archived organization loses access for staff and client users', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`update public.organizations set archived_at = now() where id = ${world.organizationId}`;

      for (const userId of [world.users.founder, world.users.manager, world.users.decisionMakerA]) {
        await sql`savepoint probe`;
        await asUser(sql, userId);
        expect(await visibleClientIds(sql), userId).toEqual([]);
        const memberships = await sql`select id from public.client_memberships`;
        expect(memberships, userId).toHaveLength(0);
        await sql`rollback to savepoint probe`;
        await asSystem(sql);
      }
    });
  });

  it('archived client blocks membership listing and invitations for its users', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const colleague = await createAuthUser(sql, { fullName: 'Colleague', kind: 'client' });
      await sql`update public.clients set archived_at = now() where id = ${world.clients.a}`;

      await sql`savepoint probe`;
      await asUser(sql, world.users.decisionMakerA);
      expect(await sql`select id from public.client_memberships`).toHaveLength(0);
      await expect(
        sql`
          insert into public.client_memberships (organization_id, client_id, user_id, role, status)
          values (${world.organizationId}, ${world.clients.a}, ${colleague}, 'operational', 'invited')
        `,
      ).rejects.toThrow(/row-level security/);
      await sql`rollback to savepoint probe`;
      await asSystem(sql);

      await asUser(sql, world.users.manager);
      expect(
        await sql`select id from public.client_memberships where client_id = ${world.clients.a}`,
      ).toHaveLength(0);
    });
  });
});
