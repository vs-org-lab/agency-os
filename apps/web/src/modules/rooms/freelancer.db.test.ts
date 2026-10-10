import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createTeamFixture,
  withTestTransaction,
  type RoomRecords,
} from '@agency-os/db/testing';
import { requestPhaseApproval } from './approvals';
import { setStepStatus, startPhase, updateStep } from './process';
import { roomClaims, roomDeps } from './testing';
import { publishUpdate } from './updates';

afterAll(async () => {
  await closeTestSql();
});

/** Opens the project's first phase with its internal step in progress. */
async function openFirstPhase(sql: TransactionSql, records: RoomRecords): Promise<void> {
  await sql`update public.project_phases set status = 'in_progress' where id = ${records.phaseIds[0]}`;
  await sql`update public.project_steps set status = 'in_progress' where id = ${records.internalStepId}`;
}

describe('freelancer writes in the room', () => {
  it('the project freelancer moves steps and publishes updates', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      await openFirstPhase(sql, team.rooms.a);
      const { deps } = roomDeps(sql);
      const freelancer = roomClaims(world.users.freelancer);

      expect(
        await setStepStatus(
          freelancer,
          { stepId: team.rooms.a.internalStepId, status: 'done' },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(
        await updateStep(
          freelancer,
          { stepId: team.rooms.a.internalStepId, dueOn: '2026-11-02' },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(
        await publishUpdate(
          freelancer,
          {
            projectId: team.rooms.a.projectId,
            body: 'Páginas principais prontas',
            milestone: null,
            visibility: 'internal',
          },
          deps,
        ),
      ).toEqual({ ok: true });
    });
  });

  it('a freelancer of another project of the client cannot', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      await openFirstPhase(sql, team.other);
      const { deps } = roomDeps(sql);
      const freelancer = roomClaims(world.users.freelancer);

      expect(
        await setStepStatus(
          freelancer,
          { stepId: team.other.internalStepId, status: 'done' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await updateStep(
          freelancer,
          { stepId: team.other.internalStepId, dueOn: '2026-11-02' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await publishUpdate(
          freelancer,
          {
            projectId: team.other.projectId,
            body: 'Nota',
            milestone: null,
            visibility: 'internal',
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('the freelancer still cannot start phases or request approvals', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const team = await createTeamFixture(sql, world);
      await openFirstPhase(sql, team.rooms.a);
      const { deps } = roomDeps(sql);
      const freelancer = roomClaims(world.users.freelancer);

      expect(await startPhase(freelancer, { phaseId: team.rooms.a.phaseIds[1] }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(
        await requestPhaseApproval(freelancer, { phaseId: team.rooms.a.phaseIds[0] }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
