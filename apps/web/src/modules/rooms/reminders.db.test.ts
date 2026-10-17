import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import { requestPhaseApproval } from './approvals';
import { sweepApprovalReminders } from './reminders';
import { projectAwaitingApproval, roomClaims, roomDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const DAY = 24 * 60 * 60 * 1000;

describe('approval reminders', () => {
  it('reminder at 2 days and alert at 5, once each', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const requested = await requestPhaseApproval(
        roomClaims(world.users.founder),
        { phaseId: project.phaseIds[0] ?? '' },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const [row] = await sql<{ requested_at: string | Date }[]>`
        select requested_at from public.approvals where id = ${requested.approvalId}
      `;
      const requestedAt = row ? new Date(row.requested_at).getTime() : 0;
      const at = (days: number) => new Date(requestedAt + days * DAY + 60_000);

      expect(await sweepApprovalReminders(at(1), deps)).toEqual({ reminded: 0, alerted: 0 });
      expect(await sweepApprovalReminders(at(2), deps)).toEqual({ reminded: 1, alerted: 0 });
      expect(await sweepApprovalReminders(at(3), deps)).toEqual({ reminded: 0, alerted: 0 });
      expect(await sweepApprovalReminders(at(5), deps)).toEqual({ reminded: 0, alerted: 1 });
      expect(await sweepApprovalReminders(at(9), deps)).toEqual({ reminded: 0, alerted: 0 });

      const events = await sql<{ type: string }[]>`
        select type from public.domain_events
        where organization_id = ${world.organizationId}
          and type in ('rooms.approval.reminded', 'rooms.approval.overdue')
      `;
      expect(events.map((event) => event.type).sort()).toEqual([
        'rooms.approval.overdue',
        'rooms.approval.reminded',
      ]);
    });
  });

  it('decided approvals get no reminder', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const requested = await requestPhaseApproval(
        roomClaims(world.users.founder),
        { phaseId: project.phaseIds[0] ?? '' },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      await sql`update public.approvals set status = 'approved' where id = ${requested.approvalId}`;

      expect(await sweepApprovalReminders(new Date(Date.now() + 10 * DAY), deps)).toEqual({
        reminded: 0,
        alerted: 0,
      });
    });
  });

  it('reminders skip paused and cancelled projects', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const requested = await requestPhaseApproval(
        roomClaims(world.users.founder),
        { phaseId: project.phaseIds[0] ?? '' },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const [row] = await sql<{ requested_at: string | Date }[]>`
        select requested_at from public.approvals where id = ${requested.approvalId}
      `;
      const requestedAt = row ? new Date(row.requested_at).getTime() : 0;
      const marks = async () => {
        const [approval] = await sql<{ reminded: boolean; alerted: boolean }[]>`
          select reminded_at is not null as reminded, alerted_at is not null as alerted
          from public.approvals where id = ${requested.approvalId}
        `;
        return approval;
      };

      for (const status of ['paused', 'cancelled']) {
        await sql`update public.projects set status = ${status}::app.project_status
                  where id = ${project.projectId}`;
        await sweepApprovalReminders(new Date(requestedAt + 6 * DAY), deps);
        expect(await marks(), status).toEqual({ reminded: false, alerted: false });
      }
      await sql`update public.projects set status = 'active' where id = ${project.projectId}`;
      await sweepApprovalReminders(new Date(requestedAt + 6 * DAY), deps);
      expect(await marks()).toEqual({ reminded: true, alerted: true });
    });
  });
});
