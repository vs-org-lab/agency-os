import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { approvalNotice, getClientApprovals } from '@/modules/rooms/server';
import { decideHubApproval, requestHubApproval } from './approvals';
import { hubClaims, hubDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function approvedPublication(sql: TransactionSql, hubId: string) {
  await sql`reset role`;
  const [row] = await sql<{ approved_publication_id: string | null }[]>`
    select approved_publication_id from public.brand_hubs where id = ${hubId}
  `;
  return row?.approved_publication_id ?? null;
}

describe('brand hub approvals', () => {
  it('the team asks the decision maker to approve the current publication', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps, flushes } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      expect(await requestHubApproval(manager, { hubId: hubs.b.hubId }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      const requested = await requestHubApproval(manager, { hubId: hubs.a.hubId }, deps);
      if (!requested.ok) throw new Error('Approval was not requested');
      await sql`reset role`;
      const [row] = await sql<{ subject_type: string; subject_id: string; project_id: string }[]>`
        select subject_type::text, subject_id, project_id from public.approvals
        where id = ${requested.approvalId}
      `;
      expect(row).toEqual({
        subject_type: 'brand_hub_publication',
        subject_id: hubs.a.publicationId,
        project_id: hubs.rooms.a.projectId,
      });
      expect(flushes).toHaveLength(1);
      expect(await requestHubApproval(manager, { hubId: hubs.a.hubId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
    });
  });

  it('a hub never published or with no open project cannot be sent for approval', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const founder = hubClaims(world.users.founder);

      expect(await requestHubApproval(founder, { hubId: hubs.b.hubId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      await sql`update public.projects set status = 'cancelled' where client_id = ${world.clients.a}`;
      expect(await requestHubApproval(founder, { hubId: hubs.a.hubId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
    });
  });

  it('approving records the approved publication once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const requested = await requestHubApproval(
        hubClaims(world.users.manager),
        { hubId: hubs.a.hubId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const decisionMaker = hubClaims(world.users.decisionMakerA, 'client');
      const decide = () =>
        decideHubApproval(
          decisionMaker,
          { approvalId: requested.approvalId, decision: 'approved', comment: '' },
          deps,
        );

      expect(await decide()).toEqual({ ok: true, status: 'approved' });
      expect(await decide()).toEqual({ ok: true, status: 'approved' });
      expect(await approvedPublication(sql, hubs.a.hubId)).toBe(hubs.a.publicationId);
      const decided = await sql<{ total: number }[]>`
        select count(*)::int as total from public.domain_events
        where organization_id = ${world.organizationId} and type = 'rooms.approval.decided'
      `;
      expect(decided[0]?.total).toBe(1);
      expect(
        await requestHubApproval(hubClaims(world.users.manager), { hubId: hubs.a.hubId }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
    });
  });

  it('changes need a comment and create the review task', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const requested = await requestHubApproval(
        hubClaims(world.users.manager),
        { hubId: hubs.a.hubId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const decisionMaker = hubClaims(world.users.decisionMakerA, 'client');

      expect(
        await decideHubApproval(
          decisionMaker,
          { approvalId: requested.approvalId, decision: 'changes_requested', comment: ' ' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'comment_required' });
      expect(
        await decideHubApproval(
          decisionMaker,
          {
            approvalId: requested.approvalId,
            decision: 'changes_requested',
            comment: 'Falta a versão escura do logótipo',
          },
          deps,
        ),
      ).toEqual({ ok: true, status: 'changes_requested' });
      expect(await approvedPublication(sql, hubs.a.hubId)).toBeNull();
      const tasks = await sql<
        { title: string; notes: string; assignee_id: string; due_on: string }[]
      >`
        select title, notes, assignee_id, due_on::text from public.tasks
        where client_id = ${world.clients.a} and title = 'Rever Brand Hub'
      `;
      expect(tasks).toEqual([
        {
          title: 'Rever Brand Hub',
          notes: 'Falta a versão escura do logótipo',
          assignee_id: world.users.manager,
          due_on: '2026-10-14',
        },
      ]);
    });
  });

  it('operational users cannot decide', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const requested = await requestHubApproval(
        hubClaims(world.users.founder),
        { hubId: hubs.a.hubId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');

      expect(
        await decideHubApproval(
          hubClaims(world.users.operationalA, 'client'),
          { approvalId: requested.approvalId, decision: 'approved', comment: '' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      await sql`reset role`;
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${hubs.rooms.a.projectId},
                ${world.users.freelancer})
      `;
      expect(
        await requestHubApproval(hubClaims(world.users.freelancer), { hubId: hubs.a.hubId }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('hub approvals appear under brand hub in the portal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const requested = await requestHubApproval(
        hubClaims(world.users.manager),
        { hubId: hubs.a.hubId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');

      const pending = await deps.contexts.withUserContext(
        hubClaims(world.users.decisionMakerA, 'client'),
        (tx) => getClientApprovals(tx, world.clients.a),
      );
      expect(pending.filter((approval) => approval.kind === 'brand_hub')).toEqual([
        expect.objectContaining({
          id: requested.approvalId,
          kind: 'brand_hub',
          subjectName: 'Brand Hub',
        }),
      ]);
    });
  });

  it('approval notices name the brand hub', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const requested = await requestHubApproval(
        hubClaims(world.users.manager),
        { hubId: hubs.a.hubId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');

      expect(
        await approvalNotice(requested.approvalId, {
          contexts: deps.contexts,
          appBaseUrl: 'https://os.example.com',
        }),
      ).toMatchObject({
        phaseName: 'Brand Hub',
        subject: 'brand_hub',
        roomUrl: `https://os.example.com/c/${world.clients.a}/hub`,
      });
    });
  });
});
