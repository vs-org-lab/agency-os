import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { closeTestSql, createFixtureWorld, withTestTransaction } from '@agency-os/db/testing';
import { decideApproval, requestPhaseApproval, withdrawApproval } from './approvals';
import { publishUpdate } from './updates';
import { projectAwaitingApproval, roomClaims, roomDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function eventTypes(sql: TransactionSql, organizationId: string): Promise<string[]> {
  const rows = await sql<{ type: string }[]>`
    select type from public.domain_events
    where organization_id = ${organizationId} and type like 'rooms.%' and type <> 'rooms.project.created'
  `;
  return rows.map((row) => row.type).sort();
}

async function phaseStatus(sql: TransactionSql, phaseId: string): Promise<string | undefined> {
  const [row] = await sql<{ status: string }[]>`
    select status::text from public.project_phases where id = ${phaseId}
  `;
  return row?.status;
}

describe('updates', () => {
  it('internal update is not published to the client and a visible one is', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const claims = roomClaims(world.users.manager);

      expect(
        await publishUpdate(
          claims,
          {
            projectId: project.projectId,
            body: 'Nota da equipa',
            milestone: null,
            visibility: 'internal',
          },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(await eventTypes(sql, world.organizationId)).toEqual([]);
      expect(
        await publishUpdate(
          claims,
          {
            projectId: project.projectId,
            body: 'Primeira versão do mapa pronta',
            milestone: 'Mapa de conteúdos',
            visibility: 'client',
          },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(await eventTypes(sql, world.organizationId)).toEqual(['rooms.update.published']);
      expect(
        await publishUpdate(
          claims,
          { projectId: project.projectId, body: '   ', milestone: null, visibility: 'client' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await publishUpdate(
          roomClaims(world.users.freelancer),
          { projectId: project.projectId, body: 'Olá', milestone: null, visibility: 'client' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});

describe('phase approvals', () => {
  it('approval completes the phase and moves to 2.4', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps, moves } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const [phaseId = ''] = project.phaseIds;

      const requested = await requestPhaseApproval(
        roomClaims(world.users.manager),
        { phaseId },
        deps,
      );
      if (!requested.ok) throw new Error(`Approval was not requested: ${requested.rule}`);
      expect(await phaseStatus(sql, phaseId)).toBe('awaiting_approval');

      expect(
        await decideApproval(
          roomClaims(world.users.decisionMakerA, 'client'),
          { approvalId: requested.approvalId, decision: 'approved', comment: '' },
          deps,
        ),
      ).toEqual({ ok: true, status: 'approved' });
      expect(await phaseStatus(sql, phaseId)).toBe('done');
      expect(moves).toEqual([{ dealId: project.dealId, code: '2.4' }]);
      expect(await eventTypes(sql, world.organizationId)).toEqual([
        'rooms.approval.decided',
        'rooms.approval.requested',
      ]);
    });
  });

  it('only the decision maker decides', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const [phaseId = ''] = project.phaseIds;
      const requested = await requestPhaseApproval(
        roomClaims(world.users.founder),
        { phaseId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const input = {
        approvalId: requested.approvalId,
        decision: 'approved' as const,
        comment: '',
      };

      for (const user of [world.users.operationalA, world.users.clientFinanceB]) {
        expect(await decideApproval(roomClaims(user, 'client'), input, deps)).toEqual({
          ok: false,
          rule: 'not_found',
        });
      }
      expect(await decideApproval(roomClaims(world.users.founder), input, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(await phaseStatus(sql, phaseId)).toBe('awaiting_approval');
    });
  });

  it('changes need a comment and send the phase back', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps, moves } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const [phaseId = ''] = project.phaseIds;
      const requested = await requestPhaseApproval(
        roomClaims(world.users.founder),
        { phaseId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const claims = roomClaims(world.users.decisionMakerA, 'client');

      expect(
        await decideApproval(
          claims,
          { approvalId: requested.approvalId, decision: 'changes_requested', comment: '  ' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'comment_required' });
      expect(
        await decideApproval(
          claims,
          {
            approvalId: requested.approvalId,
            decision: 'changes_requested',
            comment: 'Falta a página de serviços no mapa.',
          },
          deps,
        ),
      ).toEqual({ ok: true, status: 'changes_requested' });
      expect(await phaseStatus(sql, phaseId)).toBe('in_progress');
      expect(moves).toEqual([]);
    });
  });

  it('deciding twice keeps the first decision', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps, moves } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const [phaseId = ''] = project.phaseIds;
      const requested = await requestPhaseApproval(
        roomClaims(world.users.founder),
        { phaseId },
        deps,
      );
      if (!requested.ok) throw new Error('Approval was not requested');
      const claims = roomClaims(world.users.decisionMakerA, 'client');

      await decideApproval(
        claims,
        { approvalId: requested.approvalId, decision: 'approved', comment: '' },
        deps,
      );
      expect(
        await decideApproval(
          claims,
          {
            approvalId: requested.approvalId,
            decision: 'changes_requested',
            comment: 'Mudei de ideias',
          },
          deps,
        ),
      ).toEqual({ ok: true, status: 'approved' });
      expect(moves).toHaveLength(1);
    });
  });

  it('a request needs the steps done and can be withdrawn by the team', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const [phaseId = '', secondPhaseId = ''] = project.phaseIds;
      const claims = roomClaims(world.users.founder);

      expect(await requestPhaseApproval(claims, { phaseId: secondPhaseId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
      await sql`update public.project_steps set status = 'in_progress' where phase_id = ${phaseId} and position = 3`;
      expect(await requestPhaseApproval(claims, { phaseId }, deps)).toEqual({
        ok: false,
        rule: 'steps_open',
      });
      await sql`update public.project_steps set status = 'done' where phase_id = ${phaseId}`;
      const requested = await requestPhaseApproval(claims, { phaseId }, deps);
      if (!requested.ok) throw new Error('Approval was not requested');
      expect(await requestPhaseApproval(claims, { phaseId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });

      expect(await withdrawApproval(claims, { approvalId: requested.approvalId }, deps)).toEqual({
        ok: true,
      });
      expect(await phaseStatus(sql, phaseId)).toBe('in_progress');
    });
  });

  it('the team still withdraws a proof approval', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const [approval] = await sql<{ id: string }[]>`
        insert into public.approvals (organization_id, client_id, project_id, subject_type,
                                      subject_id, requested_by)
        values (${world.organizationId}, ${world.clients.a}, ${project.projectId}, 'file_version',
                gen_random_uuid(), ${world.users.founder})
        returning id
      `;

      expect(
        await withdrawApproval(
          roomClaims(world.users.manager),
          { approvalId: approval?.id ?? '' },
          deps,
        ),
      ).toEqual({ ok: true });
      const [row] = await sql<{ status: string }[]>`
        select status::text from public.approvals where id = ${approval?.id ?? ''}
      `;
      expect(row?.status).toBe('withdrawn');
    });
  });

  it('generic decisions refuse approvals that have their own path', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const project = await projectAwaitingApproval(sql, world, deps);
      const NOT_FOUND = { ok: false, rule: 'not_found' };

      for (const subjectType of ['retainer_extra', 'document_version', 'brand_hub_publication']) {
        const [approval] = await sql<{ id: string }[]>`
          insert into public.approvals (organization_id, client_id, project_id, subject_type,
                                        subject_id, requested_by)
          values (${world.organizationId}, ${world.clients.a}, ${project.projectId},
                  ${subjectType}::app.approval_subject, gen_random_uuid(), ${world.users.founder})
          returning id
        `;
        const approvalId = approval?.id ?? '';

        expect(
          await decideApproval(
            roomClaims(world.users.decisionMakerA, 'client'),
            { approvalId, decision: 'approved', comment: '' },
            deps,
          ),
        ).toEqual(NOT_FOUND);
        expect(
          await withdrawApproval(roomClaims(world.users.manager), { approvalId }, deps),
        ).toEqual(NOT_FOUND);
        const [row] = await sql<{ status: string }[]>`
          select status::text from public.approvals where id = ${approvalId}
        `;
        expect(row?.status, subjectType).toBe('pending');
      }
    });
  });
});
