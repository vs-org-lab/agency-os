import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createDeliveryFixture,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import {
  linkProjectPhases,
  requestDeliveryMilestones,
  requestMilestonesForPhase,
  setMilestonePhase,
} from './links';
import { createPlanForContract, requestPayment } from './requests';
import { billingClaims, billingDeps, signedContract } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function milestone(
  sql: Parameters<Parameters<typeof withTestTransaction>[0]>[0],
  id: string,
) {
  const [row] = await sql<{ status: string; phase_id: string | null; requests: number }[]>`
    select m.status::text, m.phase_id,
           (select count(*)::int from public.payment_requests r where r.milestone_id = m.id) as requests
    from public.billing_milestones m where m.id = ${id}
  `;
  return row;
}

describe('milestones released by phases and delivery', () => {
  it('new plans get triggers', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await signedContract(sql, world);
      const { deps } = billingDeps(sql);

      await createPlanForContract(contract.contractId, deps);

      const rows = await sql<{ trigger: string }[]>`
        select trigger::text from public.billing_milestones
        where contract_id = ${contract.contractId} order by position
      `;
      expect(rows.map((row) => row.trigger)).toEqual(['signature', 'delivery']);
    });
  });

  it('project creation links middle milestones to approval phases', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = billingDeps(sql);
      await sql`
        update public.billing_milestones set phase_id = null where id = ${delivery.milestoneIds.phase}
      `;

      expect(await linkProjectPhases(delivery.projectId, deps)).toEqual({ linked: 1 });
      expect((await milestone(sql, delivery.milestoneIds.phase))?.phase_id).toBe(
        delivery.approvalPhaseId,
      );
      expect(await linkProjectPhases(delivery.projectId, deps)).toEqual({ linked: 0 });
    });
  });

  it('linking skips milestones no longer pending', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = billingDeps(sql);
      await sql`
        update public.billing_milestones set phase_id = null, status = 'requested'
        where id = ${delivery.milestoneIds.phase}
      `;

      expect(await linkProjectPhases(delivery.projectId, deps)).toEqual({ linked: 0 });
    });
  });

  it('manual request is refused until the linked phase is approved', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = billingDeps(sql);
      const founder = billingClaims(world.users.founder);
      await sql`update public.approvals set status = 'pending' where id = ${delivery.phaseApprovalId}`;

      expect(
        await requestPayment(founder, { milestoneId: delivery.milestoneIds.phase }, deps),
      ).toEqual({ ok: false, rule: 'milestone_locked' });
      await sql`update public.approvals set status = 'approved' where id = ${delivery.phaseApprovalId}`;
      expect(
        (await requestPayment(founder, { milestoneId: delivery.milestoneIds.phase }, deps)).ok,
      ).toBe(true);
    });
  });

  it('delivery milestone waits for the final approval', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = billingDeps(sql);
      const founder = billingClaims(world.users.founder);

      expect(
        await requestPayment(founder, { milestoneId: delivery.milestoneIds.delivery }, deps),
      ).toEqual({ ok: false, rule: 'milestone_locked' });
      expect(await requestDeliveryMilestones(delivery.projectId, deps)).toEqual({ requested: [] });
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;
      expect(await requestDeliveryMilestones(delivery.projectId, deps)).toEqual({
        requested: [delivery.milestoneIds.delivery],
      });
      expect(await milestone(sql, delivery.milestoneIds.delivery)).toMatchObject({
        status: 'requested',
        requests: 1,
      });
    });
  });

  it('approving the phase requests the linked milestone once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const { deps } = billingDeps(sql);

      expect(await requestMilestonesForPhase(delivery.approvalPhaseId, deps)).toEqual({
        requested: [delivery.milestoneIds.phase],
      });
      expect(await requestMilestonesForPhase(delivery.approvalPhaseId, deps)).toEqual({
        requested: [],
      });
      expect(await milestone(sql, delivery.milestoneIds.phase)).toMatchObject({
        status: 'requested',
        requests: 1,
      });
    });
  });

  it('billing writers move a pending milestone to another approval phase', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const rooms = await createRoomFixture(sql, world);
      const { deps } = billingDeps(sql);
      const founder = billingClaims(world.users.founder);
      const [review] = await sql<{ id: string }[]>`
        insert into public.project_phases (organization_id, client_id, project_id, position, name,
                                           requires_approval, status)
        values (${world.organizationId}, ${world.clients.a}, ${delivery.projectId}, 3,
                'Apresentação', true, 'pending')
        returning id
      `;
      const move = (milestoneId: string, phaseId: string | null) =>
        setMilestonePhase(founder, { milestoneId, phaseId }, deps);

      expect(await move(delivery.milestoneIds.phase, review?.id ?? '')).toEqual({ ok: true });
      expect((await milestone(sql, delivery.milestoneIds.phase))?.phase_id).toBe(review?.id);
      for (const phaseId of [
        delivery.finalPhaseId,
        delivery.approvalPhaseId,
        rooms.a.phaseIds[0],
      ]) {
        expect(await move(delivery.milestoneIds.phase, phaseId)).toEqual({
          ok: false,
          rule: 'invalid_phase',
        });
      }
      expect(await move(delivery.milestoneIds.phase, null)).toEqual({ ok: true });
      expect(await move(delivery.milestoneIds.signature, review?.id ?? '')).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      expect(
        await setMilestonePhase(
          billingClaims(world.users.freelancer),
          { milestoneId: delivery.milestoneIds.phase, phaseId: review?.id ?? '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
