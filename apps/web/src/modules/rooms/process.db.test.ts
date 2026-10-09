import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { completePhase, setStepStatus, startPhase, updatePhase, updateStep } from './process';
import { createProjectForDeal } from './projects';
import type { RoomsDeps } from './runtime-types';
import { roomClaims, roomDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

type Started = {
  projectId: string;
  dealId: string;
  phases: Array<{ id: string; position: number }>;
  steps: Array<{ id: string; phasePosition: number; position: number }>;
};

async function kickoff(sql: TransactionSql, world: World, deps: RoomsDeps): Promise<Started> {
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${world.organizationId}, ${world.clients.a}, 'Website', '2.2', 'acquisition')
    returning id
  `;
  if (!deal) throw new Error('Deal was not created');
  const created = await createProjectForDeal(deal.id, deps);
  const projectId = created.projectId ?? '';
  const phases = await sql<{ id: string; position: number }[]>`
    select id, position from public.project_phases where project_id = ${projectId} order by position
  `;
  const steps = await sql<{ id: string; phase_position: number; position: number }[]>`
    select s.id, ph.position as phase_position, s.position
    from public.project_steps s join public.project_phases ph on ph.id = s.phase_id
    where s.project_id = ${projectId} order by ph.position, s.position
  `;
  return {
    projectId,
    dealId: deal.id,
    phases: [...phases],
    steps: steps.map((row) => ({
      id: row.id,
      phasePosition: row.phase_position,
      position: row.position,
    })),
  };
}

function stepOf(started: Started, phasePosition: number, position: number): string {
  const step = started.steps.find(
    (entry) => entry.phasePosition === phasePosition && entry.position === position,
  );
  if (!step) throw new Error(`Step ${phasePosition}.${position} is missing`);
  return step.id;
}

function phaseOf(started: Started, position: number): string {
  const phase = started.phases.find((entry) => entry.position === position);
  if (!phase) throw new Error(`Phase ${position} is missing`);
  return phase.id;
}

async function stepRow(sql: TransactionSql, stepId: string) {
  const [row] = await sql<{ status: string; shared: boolean; reopened: boolean }[]>`
    select status::text, shared_at is not null as shared, reopened_after_shared as reopened
    from public.project_steps where id = ${stepId}
  `;
  return row;
}

describe('process', () => {
  it('starting a phase moves the deal to its code and starts its first step', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps, moves } = roomDeps(sql);
      const started = await kickoff(sql, world, deps);

      expect(
        await startPhase(roomClaims(world.users.manager), { phaseId: phaseOf(started, 1) }, deps),
      ).toEqual({
        ok: true,
      });
      expect(moves).toEqual([{ dealId: started.dealId, code: '2.3' }]);
      expect((await stepRow(sql, stepOf(started, 1, 1)))?.status).toBe('in_progress');
      expect(
        await startPhase(roomClaims(world.users.manager), { phaseId: phaseOf(started, 1) }, deps),
      ).toEqual({ ok: false, rule: 'invalid_state' });
    });
  });

  it('previous phase must be done', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const started = await kickoff(sql, world, deps);

      expect(
        await startPhase(roomClaims(world.users.founder), { phaseId: phaseOf(started, 2) }, deps),
      ).toEqual({ ok: false, rule: 'previous_phase_open' });
    });
  });

  it('chained visible step is shared once and an internal one is not', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const started = await kickoff(sql, world, deps);
      const claims = roomClaims(world.users.manager);
      await startPhase(claims, { phaseId: phaseOf(started, 1) }, deps);

      await setStepStatus(claims, { stepId: stepOf(started, 1, 1), status: 'done' }, deps);
      expect(await stepRow(sql, stepOf(started, 1, 2))).toEqual({
        status: 'in_progress',
        shared: false,
        reopened: false,
      });
      await setStepStatus(claims, { stepId: stepOf(started, 1, 2), status: 'done' }, deps);
      expect(await stepRow(sql, stepOf(started, 1, 3))).toEqual({
        status: 'in_progress',
        shared: true,
        reopened: false,
      });

      const updates = await sql<{ kind: string; body: string }[]>`
        select kind::text, body from public.project_updates
        where project_id = ${started.projectId} and kind = 'step_shared'
      `;
      expect(updates).toEqual([{ kind: 'step_shared', body: 'Arquitetura e mapa de conteúdos' }]);
      const events = await sql`
        select id from public.domain_events
        where type = 'rooms.step.shared' and organization_id = ${world.organizationId}
      `;
      expect(events).toHaveLength(1);
    });
  });

  it('reopening a shared step flags it and keeps it shared', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const started = await kickoff(sql, world, deps);
      const claims = roomClaims(world.users.founder);
      await startPhase(claims, { phaseId: phaseOf(started, 1) }, deps);
      await setStepStatus(claims, { stepId: stepOf(started, 1, 1), status: 'done' }, deps);
      await setStepStatus(claims, { stepId: stepOf(started, 1, 2), status: 'done' }, deps);
      await setStepStatus(claims, { stepId: stepOf(started, 1, 3), status: 'done' }, deps);

      await setStepStatus(claims, { stepId: stepOf(started, 1, 3), status: 'in_progress' }, deps);

      expect(await stepRow(sql, stepOf(started, 1, 3))).toEqual({
        status: 'in_progress',
        shared: true,
        reopened: true,
      });
    });
  });

  it('phase with open steps cannot complete and approval is required for this one', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const started = await kickoff(sql, world, deps);
      const claims = roomClaims(world.users.founder);
      const phaseId = phaseOf(started, 1);
      await startPhase(claims, { phaseId }, deps);

      expect(await completePhase(claims, { phaseId }, deps)).toEqual({
        ok: false,
        rule: 'steps_open',
      });
      for (const position of [1, 2, 3]) {
        await setStepStatus(claims, { stepId: stepOf(started, 1, position), status: 'done' }, deps);
      }
      expect(await completePhase(claims, { phaseId }, deps)).toEqual({
        ok: false,
        rule: 'approval_required',
      });
    });
  });

  it('a phase without approval completes, posts to the feed and the next one can start', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps, moves } = roomDeps(sql);
      const started = await kickoff(sql, world, deps);
      const claims = roomClaims(world.users.founder);
      await sql`update public.project_phases set status = 'done' where id = ${phaseOf(started, 1)}`;
      const phaseId = phaseOf(started, 2);
      await startPhase(claims, { phaseId }, deps);
      for (const position of [1, 2, 3]) {
        await setStepStatus(claims, { stepId: stepOf(started, 2, position), status: 'done' }, deps);
      }

      expect(await completePhase(claims, { phaseId }, deps)).toEqual({ ok: true });
      expect(await startPhase(claims, { phaseId: phaseOf(started, 3) }, deps)).toEqual({
        ok: true,
      });
      expect(moves.map((move) => move.code)).toEqual(['2.5', '2.6']);
      const [update] = await sql<{ kind: string; visibility: string; body: string }[]>`
        select kind::text, visibility::text, body from public.project_updates
        where project_id = ${started.projectId} and kind = 'phase_done'
      `;
      expect(update).toEqual({ kind: 'phase_done', visibility: 'client', body: 'Produção' });
    });
  });

  it('freelancer changes only own steps and never starts phases', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const started = await kickoff(sql, world, deps);
      const founder = roomClaims(world.users.founder);
      const freelancer = roomClaims(world.users.freelancer);
      await startPhase(founder, { phaseId: phaseOf(started, 1) }, deps);
      const stepId = stepOf(started, 1, 1);

      expect(await setStepStatus(freelancer, { stepId, status: 'done' }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(
        await updateStep(founder, { stepId, assigneeId: world.users.freelancer }, deps),
      ).toEqual({ ok: true });
      expect(await setStepStatus(freelancer, { stepId, status: 'done' }, deps)).toEqual({
        ok: true,
      });
      expect(await startPhase(freelancer, { phaseId: phaseOf(started, 2) }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(
        await updateStep(founder, { stepId, assigneeId: world.users.decisionMakerA }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('phase due dates set the project end date', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { deps } = roomDeps(sql);
      const started = await kickoff(sql, world, deps);
      const claims = roomClaims(world.users.manager);

      await updatePhase(claims, { phaseId: phaseOf(started, 1), dueOn: '2026-11-06' }, deps);
      await updatePhase(claims, { phaseId: phaseOf(started, 2), dueOn: '2026-12-18' }, deps);

      const [project] = await sql<{ ends_on: string }[]>`
        select ends_on::text from public.projects where id = ${started.projectId}
      `;
      expect(project?.ends_on).toBe('2026-12-18');
    });
  });
});
