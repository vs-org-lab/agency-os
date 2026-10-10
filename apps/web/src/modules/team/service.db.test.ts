import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createTeamFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { resolveActor } from '@/modules/access';
import {
  changeRole,
  listTeam,
  loadMember,
  restoreAccess,
  revokeAccess,
  setClientAssignment,
  setProjectAssignment,
  setRates,
} from './service';
import { TEAM_TEST_NOW, teamClaims, teamDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('team services', () => {
  it('founder lists the team with load and rates', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      await sql`
        update public.tasks set assignee_id = ${world.users.freelancer}, due_on = '2026-10-16'
        where id = ${team.assignedTaskId}
      `;
      const deps = teamDeps(sql);

      const members = await listTeam(teamClaims(world.users.founder), TEAM_TEST_NOW, deps);
      const freelancer = members?.find((member) => member.userId === world.users.freelancer);

      expect(freelancer).toMatchObject({
        role: 'freelancer',
        status: 'active',
        clientCount: 1,
        load: { tasksThisWeek: 1, activeProjects: 1 },
        rates: { hourlyCost: '35.00', currency: 'EUR', weeklyHours: 20 },
      });
      expect(freelancer?.email).toContain('@');
      expect(await listTeam(teamClaims(world.users.manager), TEAM_TEST_NOW, deps)).toBeNull();
      expect(await listTeam(teamClaims(world.users.finance), TEAM_TEST_NOW, deps)).toBeNull();
    });
  });

  it('member view lists assignable clients and the projects of assigned clients', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      const deps = teamDeps(sql);

      const member = await loadMember(
        teamClaims(world.users.founder),
        world.users.freelancer,
        deps,
      );

      expect(member?.clients.find((client) => client.id === world.clients.a)?.assigned).toBe(true);
      expect(member?.clients.find((client) => client.id === world.clients.b)?.assigned).toBe(false);
      expect(
        Object.fromEntries(member?.projects.map((project) => [project.id, project.assigned]) ?? []),
      ).toEqual({ [team.rooms.a.projectId]: true, [team.other.projectId]: false });
    });
  });

  it('role change needs recent mfa', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = teamDeps(sql);

      expect(
        await changeRole(
          teamClaims(world.users.founder, 30),
          { userId: world.users.freelancer, role: 'project_manager' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'reauthentication_required' });
      expect(
        await changeRole(
          teamClaims(world.users.founder),
          { userId: world.users.freelancer, role: 'project_manager' },
          deps,
        ),
      ).toEqual({ ok: true });
      const [row] = await sql<{ role: string }[]>`
        select role::text from public.organization_memberships
        where user_id = ${world.users.freelancer} and organization_id = ${world.organizationId}
      `;
      expect(row?.role).toBe('project_manager');
    });
  });

  it('revoked member resolves no actor', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createTeamFixture(sql, world);
      const deps = teamDeps(sql);
      const freelancerClaims = teamClaims(world.users.freelancer);

      expect(
        await revokeAccess(
          teamClaims(world.users.founder),
          { userId: world.users.freelancer },
          deps,
        ),
      ).toEqual({ ok: true });

      expect(
        await deps.contexts.withUserContext(freelancerClaims, (tx) =>
          resolveActor(tx, freelancerClaims),
        ),
      ).toBeNull();
      const [assignments] = await sql<{ open: number }[]>`
        select (select count(*) from public.client_staff_assignments
                where user_id = ${world.users.freelancer} and archived_at is null)
             + (select count(*) from public.project_staff_assignments
                where user_id = ${world.users.freelancer} and archived_at is null) as open
      `;
      expect(Number(assignments?.open)).toBe(0);
    });
  });

  it('the last founder keeps access', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = teamDeps(sql);
      await sql`
        update public.organization_memberships set role = 'founder'
        where user_id = ${world.users.manager} and organization_id = ${world.organizationId}
      `;

      expect(
        await revokeAccess(teamClaims(world.users.manager), { userId: world.users.founder }, deps),
      ).toEqual({ ok: true });
      expect(
        await changeRole(
          teamClaims(world.users.manager),
          { userId: world.users.manager, role: 'finance' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('founders cannot revoke themselves', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = teamDeps(sql);

      expect(
        await revokeAccess(teamClaims(world.users.founder), { userId: world.users.founder }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('project assignment assigns the client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      const deps = teamDeps(sql);
      const founder = teamClaims(world.users.founder);
      const [projectB] = await sql<{ id: string }[]>`
        select id from public.projects where client_id = ${world.clients.b} limit 1
      `;

      expect(
        await setProjectAssignment(
          founder,
          { userId: world.users.freelancer, projectId: projectB?.id ?? '', assigned: true },
          deps,
        ),
      ).toEqual({ ok: true });
      const [clientRow] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.client_staff_assignments
        where client_id = ${world.clients.b} and user_id = ${world.users.freelancer}
          and archived_at is null
      `;
      expect(clientRow?.count).toBe(1);
      expect(
        await setProjectAssignment(
          founder,
          { userId: world.users.manager, projectId: team.other.projectId, assigned: true },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await setClientAssignment(
          founder,
          { userId: world.users.freelancer, clientId: world.clients.a, assigned: false },
          deps,
        ),
      ).toEqual({ ok: true });
      const [projectRow] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.project_staff_assignments
        where client_id = ${world.clients.a} and user_id = ${world.users.freelancer}
          and archived_at is null
      `;
      expect(projectRow?.count).toBe(0);
    });
  });

  it('restore brings access back without assignments', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createTeamFixture(sql, world);
      const deps = teamDeps(sql);
      const founder = teamClaims(world.users.founder);
      await revokeAccess(founder, { userId: world.users.freelancer }, deps);

      expect(await restoreAccess(founder, { userId: world.users.freelancer }, deps)).toEqual({
        ok: true,
      });
      expect(await restoreAccess(founder, { userId: world.users.freelancer }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      const member = await loadMember(founder, world.users.freelancer, deps);
      expect(member?.status).toBe('active');
      expect(member?.clients.some((client) => client.assigned)).toBe(false);
    });
  });

  it('rates are saved by the founder only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = teamDeps(sql);
      const input = {
        userId: world.users.manager,
        hourlyCost: '42.50',
        currency: 'EUR' as const,
        weeklyHours: 35,
      };

      expect(await setRates(teamClaims(world.users.finance), input, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(await setRates(teamClaims(world.users.founder, 120), input, deps)).toEqual({
        ok: true,
      });
      expect(
        await setRates(teamClaims(world.users.founder), { ...input, weeklyHours: 90 }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });
});
