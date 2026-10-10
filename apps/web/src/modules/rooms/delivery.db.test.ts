import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDeliveryFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { decideApproval, requestFinalApproval } from './approvals';
import { approvalNotice } from './notices';
import { getClientApprovals } from './portal';
import { roomClaims, roomDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function project(sql: TransactionSql, projectId: string) {
  const [row] = await sql<{ status: string; delivered: boolean }[]>`
    select status::text, delivered_at is not null as delivered from public.projects
    where id = ${projectId}
  `;
  return row;
}

async function deliveredEvents(sql: TransactionSql, organizationId: string): Promise<number> {
  const [row] = await sql<{ total: number }[]>`
    select count(*)::int as total from public.domain_events
    where organization_id = ${organizationId} and type = 'rooms.project.delivered'
  `;
  return row?.total ?? 0;
}

describe('final approval', () => {
  it('final approval needs every phase done', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = roomDeps(sql);
      const manager = roomClaims(world.users.manager);
      await sql`update public.projects set status = 'active' where id = ${delivery.projectId}`;
      await sql`
        update public.project_phases set status = 'in_progress' where id = ${delivery.finalPhaseId}
      `;

      expect(await requestFinalApproval(manager, { projectId: delivery.projectId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      await sql`update public.projects set status = 'completed' where id = ${delivery.projectId}`;
      await sql`update public.project_phases set status = 'done' where id = ${delivery.finalPhaseId}`;
      const requested = await requestFinalApproval(
        manager,
        { projectId: delivery.projectId },
        deps,
      );
      if (!requested.ok) throw new Error('Final approval was not requested');
      expect(await requestFinalApproval(manager, { projectId: delivery.projectId }, deps)).toEqual(
        requested,
      );
      await sql`update public.approvals set status = 'approved' where id = ${requested.approvalId}`;
      expect(await requestFinalApproval(manager, { projectId: delivery.projectId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      expect(
        await requestFinalApproval(
          roomClaims(world.users.freelancer),
          { projectId: delivery.projectId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('approving the final approval delivers the project once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = roomDeps(sql);
      const requested = await requestFinalApproval(
        roomClaims(world.users.manager),
        { projectId: delivery.projectId },
        deps,
      );
      if (!requested.ok) throw new Error('Final approval was not requested');
      const decide = () =>
        decideApproval(
          roomClaims(world.users.decisionMakerA, 'client'),
          { approvalId: requested.approvalId, decision: 'approved', comment: '' },
          deps,
        );

      expect(await decide()).toEqual({ ok: true, status: 'approved' });
      expect(await decide()).toEqual({ ok: true, status: 'approved' });
      await sql`reset role`;
      expect(await project(sql, delivery.projectId)).toEqual({
        status: 'delivered',
        delivered: true,
      });
      expect(await deliveredEvents(sql, world.organizationId)).toBe(1);
      const updates = await sql<{ visibility: string }[]>`
        select visibility::text from public.project_updates
        where project_id = ${delivery.projectId} and kind = 'project_delivered'
      `;
      expect(updates).toEqual([{ visibility: 'client' }]);
    });
  });

  it('changes on the final approval create the review task', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = roomDeps(sql);
      const requested = await requestFinalApproval(
        roomClaims(world.users.manager),
        { projectId: delivery.projectId },
        deps,
      );
      if (!requested.ok) throw new Error('Final approval was not requested');

      expect(
        await decideApproval(
          roomClaims(world.users.decisionMakerA, 'client'),
          {
            approvalId: requested.approvalId,
            decision: 'changes_requested',
            comment: 'Falta o rodapé',
          },
          deps,
        ),
      ).toEqual({ ok: true, status: 'changes_requested' });
      await sql`reset role`;
      const tasks = await sql<{ title: string; notes: string; assignee_id: string }[]>`
        select title, notes, assignee_id from public.tasks where project_id = ${delivery.projectId}
      `;
      expect(tasks).toEqual([
        { title: 'Rever entrega final', notes: 'Falta o rodapé', assignee_id: world.users.manager },
      ]);
      expect(await project(sql, delivery.projectId)).toEqual({
        status: 'completed',
        delivered: false,
      });
      expect(await deliveredEvents(sql, world.organizationId)).toBe(0);
    });
  });

  it('final approval alerts name the delivery', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = roomDeps(sql);
      const requested = await requestFinalApproval(
        roomClaims(world.users.manager),
        { projectId: delivery.projectId },
        deps,
      );
      if (!requested.ok) throw new Error('Final approval was not requested');

      expect(
        await approvalNotice(requested.approvalId, {
          contexts: deps.contexts,
          appBaseUrl: 'https://os.example.com',
        }),
      ).toMatchObject({
        phaseName: 'Website',
        subject: 'delivery',
        roomUrl: `https://os.example.com/c/${world.clients.a}`,
      });
    });
  });

  it('the portal lists the final approval under delivery', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = roomDeps(sql);
      const requested = await requestFinalApproval(
        roomClaims(world.users.manager),
        { projectId: delivery.projectId },
        deps,
      );
      if (!requested.ok) throw new Error('Final approval was not requested');

      const pending = await deps.contexts.withUserContext(
        roomClaims(world.users.decisionMakerA, 'client'),
        (tx) => getClientApprovals(tx, world.clients.a),
      );
      expect(pending).toEqual([
        expect.objectContaining({
          id: requested.approvalId,
          kind: 'delivery',
          subjectName: 'Website',
          versionId: null,
        }),
      ]);
    });
  });
});
