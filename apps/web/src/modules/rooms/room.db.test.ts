import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  createTeamFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createProjectAsStaff } from './projects';
import { getClientApprovals, getClientRoom } from './portal';
import { loadRoom, loadRoomPreview } from './room';
import { roomClaims, roomDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('room reads', () => {
  it('preview equals the portal and hides internal items', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps } = roomDeps(sql);

      const portal = await deps.contexts.withUserContext(
        roomClaims(world.users.decisionMakerA, 'client'),
        (tx) => getClientRoom(tx, world.clients.a),
      );
      const preview = await loadRoomPreview(
        roomClaims(world.users.manager),
        { clientId: world.clients.a },
        deps,
      );

      expect(preview).toEqual(portal);
      const serialised = JSON.stringify(portal);
      expect(serialised).toContain(rooms.a.visibleStepId);
      expect(serialised).toContain(rooms.a.clientUpdateId);
      expect(serialised).not.toContain(rooms.a.internalStepId);
      expect(serialised).not.toContain(rooms.a.internalUpdateId);
      expect(serialised).not.toContain('Nota interna');
      expect(portal?.project?.approvals.map((approval) => approval.id)).toEqual([
        rooms.a.approvalId,
      ]);
    });
  });

  it('room shows the project selector with two projects and internal items for the team', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps } = roomDeps(sql);
      const claims = roomClaims(world.users.manager);
      const second = await createProjectAsStaff(
        claims,
        { clientId: world.clients.a, name: 'Campanha', templateKey: 'orbit' },
        deps,
      );
      if (!second.ok) throw new Error('Second project was not created');
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${rooms.a.projectId},
                ${world.users.freelancer})
      `;

      const room = await loadRoom(
        claims,
        { clientId: world.clients.a, projectId: rooms.a.projectId },
        deps,
      );

      expect(room?.projects.map((project) => project.id).sort()).toEqual(
        [rooms.a.projectId, second.projectId].sort(),
      );
      expect(room?.project?.id).toBe(rooms.a.projectId);
      const steps = room?.project?.phases.flatMap((phase) => phase.steps.map((step) => step.id));
      expect(steps).toEqual(
        expect.arrayContaining([rooms.a.visibleStepId, rooms.a.internalStepId]),
      );
      expect(room?.project?.updates.map((update) => update.id)).toEqual(
        expect.arrayContaining([rooms.a.clientUpdateId, rooms.a.internalUpdateId]),
      );
      expect(room?.people.map((person) => person.name).sort()).toEqual([
        'Founder',
        'Freelancer',
        'Manager',
      ]);
      expect(room?.team.map((person) => person.name).sort()).toEqual(['Freelancer', 'Manager']);
      expect(await loadRoom(claims, { clientId: world.clients.b }, deps)).toBeNull();
    });
  });

  it('operational reads the room and client finance does not', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const { deps } = roomDeps(sql);

      const operational = await deps.contexts.withUserContext(
        roomClaims(world.users.operationalA, 'client'),
        (tx) => getClientRoom(tx, world.clients.a),
      );
      expect(operational?.project?.id).toBe(rooms.a.projectId);
      const finance = await deps.contexts.withUserContext(
        roomClaims(world.users.clientFinanceB, 'client'),
        (tx) => getClientRoom(tx, world.clients.b),
      );
      expect(finance).toBeNull();
    });
  });

  it('lists pending approvals across every project of the client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const rooms = await createRoomFixture(sql, world);
      const [project] = await sql<{ id: string }[]>`
        insert into public.projects (organization_id, client_id, name, template_key, template_version,
                                     starts_on)
        values (${world.organizationId}, ${world.clients.a}, 'Campanha', 'orbit', 1, current_date)
        returning id
      `;
      const projectId = project?.id ?? '';
      const [phase] = await sql<{ id: string }[]>`
        insert into public.project_phases (organization_id, client_id, project_id, position, name,
                                           requires_approval, status)
        values (${world.organizationId}, ${world.clients.a}, ${projectId}, 1, 'Conceito', true,
                'awaiting_approval')
        returning id
      `;
      const phaseId = phase?.id ?? '';
      const [approval] = await sql<{ id: string }[]>`
        insert into public.approvals (organization_id, client_id, project_id, subject_type, subject_id)
        values (${world.organizationId}, ${world.clients.a}, ${projectId}, 'phase', ${phaseId})
        returning id
      `;
      const { deps } = roomDeps(sql);

      const approvals = await deps.contexts.withUserContext(
        roomClaims(world.users.decisionMakerA, 'client'),
        (tx) => getClientApprovals(tx, world.clients.a),
      );

      expect(
        approvals.map((entry) => [entry.id, entry.projectName, entry.phaseName]).sort(),
      ).toEqual(
        [
          [rooms.a.approvalId, 'Website', 'Fase 1'],
          [approval?.id, 'Campanha', 'Conceito'],
        ].sort(),
      );
    });
  });

  it('freelancer room lists only assigned projects', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      const { deps } = roomDeps(sql);

      const room = await loadRoom(
        roomClaims(world.users.freelancer),
        { clientId: world.clients.a },
        deps,
      );

      expect(room?.projects.map((project) => project.id)).toEqual([team.rooms.a.projectId]);
      expect(room?.project?.id).toBe(team.rooms.a.projectId);
      const manager = await loadRoom(
        roomClaims(world.users.manager),
        { clientId: world.clients.a },
        deps,
      );
      expect(manager?.projects).toHaveLength(2);
    });
  });

  it('freelancer cannot open another project by id', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      const { deps } = roomDeps(sql);
      const claims = roomClaims(world.users.freelancer);

      const room = await loadRoom(
        claims,
        { clientId: world.clients.a, projectId: team.other.projectId },
        deps,
      );
      const preview = await loadRoomPreview(
        claims,
        { clientId: world.clients.a, projectId: team.other.projectId },
        deps,
      );

      expect(room?.project?.id).not.toBe(team.other.projectId);
      expect(JSON.stringify(room)).not.toContain(team.other.projectId);
      expect(JSON.stringify(preview)).not.toContain(team.other.projectId);
    });
  });

  it('unassigned staff and freelancers off the project are not offered', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      await sql`
        update public.client_staff_assignments set archived_at = now()
        where client_id = ${world.clients.a} and user_id = ${world.users.manager}
      `;
      const { deps } = roomDeps(sql);
      const founder = roomClaims(world.users.founder);

      const assigned = await loadRoom(
        founder,
        { clientId: world.clients.a, projectId: team.rooms.a.projectId },
        deps,
      );
      const other = await loadRoom(
        founder,
        { clientId: world.clients.a, projectId: team.other.projectId },
        deps,
      );

      const ids = (people: Array<{ id: string }> | undefined) => people?.map((person) => person.id);
      expect(ids(assigned?.people)).not.toContain(world.users.manager);
      expect(ids(assigned?.team)).not.toContain(world.users.manager);
      expect(ids(assigned?.people)).toContain(world.users.freelancer);
      expect(ids(other?.people)).not.toContain(world.users.freelancer);
      expect(ids(other?.people)).toContain(world.users.founder);
    });
  });
});
