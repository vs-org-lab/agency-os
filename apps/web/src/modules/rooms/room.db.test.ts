import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createProjectAsStaff } from './projects';
import { getClientRoom } from './portal';
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
      expect(room?.people.map((person) => person.name)).toEqual(
        expect.arrayContaining(['Founder', 'Manager', 'Freelancer']),
      );
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
});
