import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCommercialFixture,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { applyStageChange, changeDealStage, updateDealTracking } from './service';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string): VerifiedClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: now }],
  };
}

const noFlush = async () => {};

async function codeOf(sql: TransactionSql, dealId: string): Promise<string> {
  await sql`reset role`;
  const [row] = await sql<{ code: string }[]>`
    select pipeline_code::text as code from public.deals where id = ${dealId}
  `;
  return row?.code ?? '';
}

async function countRows(sql: TransactionSql, table: string, dealId: string): Promise<number> {
  await sql`reset role`;
  const column = table === 'audit_log' ? 'resource_id' : 'deal_id';
  const [row] = await sql<{ count: number }[]>`
    select count(*)::int as count from ${sql('public.' + table)} where ${sql(column)} = ${dealId}
  `;
  return row?.count ?? 0;
}

describe('pipeline stage service', () => {
  async function coreAt(sql: TransactionSql, code: string) {
    const world = await createFixtureWorld(sql);
    const core = await createCoreFixture(sql, world);
    await sql`update public.deals set pipeline_code = ${code} where id = ${core.a.dealId}`;
    return { world, core };
  }

  it('moving to 1.4 without cross review is refused with gaps', async () => {
    await withTestTransaction(async (sql) => {
      const { world, core } = await coreAt(sql, '1.3');
      const deps = { contexts: createDbContexts(testDatabase(sql)), flush: noFlush };

      const result = await changeDealStage(
        claimsFor(world.users.founder),
        { dealId: core.a.dealId, to: '1.4', reason: null },
        deps,
      );

      expect(result).toEqual({
        ok: false,
        rule: 'core_criteria',
        gaps: ['fronts_unscored', 'internal_items_below_minimum', 'cross_review_missing'],
      });
    });
  });

  it('moving to 1.4 with every criterion met succeeds', async () => {
    await withTestTransaction(async (sql) => {
      const { world, core } = await coreAt(sql, '1.3');
      await sql`
        insert into public.core_findings (organization_id, client_id, engagement_id, front, title,
                                          evidence_kind, evidence_value, impact, effort, lane, owner)
        values (${world.organizationId}, ${world.clients.a}, ${core.a.engagementId}, 'core',
                'Unclear proposition', 'page', 'Homepage', 'high', 'low', 'days_30', 'internal')
      `;
      await sql`delete from public.core_scores where engagement_id = ${core.a.engagementId}`;
      for (const front of ['core', 'orbit', 'gravity', 'constellation']) {
        for (const index of [1, 2, 3, 4, 5]) {
          await sql`
            insert into public.core_scores (organization_id, client_id, engagement_id, front,
                                            criterion_id, points, justification)
            values (${world.organizationId}, ${world.clients.a}, ${core.a.engagementId},
                    ${front}, ${front + '_' + index}, 3, 'Evidence')
          `;
        }
      }
      await sql`
        update public.core_engagements set cross_review_at = now(), cross_review_by = ${world.users.manager}
        where id = ${core.a.engagementId}
      `;
      const deps = { contexts: createDbContexts(testDatabase(sql)), flush: noFlush };

      const result = await changeDealStage(
        claimsFor(world.users.founder),
        { dealId: core.a.dealId, to: '1.4', reason: null },
        deps,
      );

      expect(result).toEqual({ ok: true, from: '1.3', to: '1.4' });
    });
  });

  it('closing a deal cancels its scheduled call without notifying the lead', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));
      await sql`update public.calls set external_event_id = 'event-1' where id = ${fixture.a.callId}`;

      const result = await changeDealStage(
        claimsFor(world.users.founder),
        { dealId: fixture.a.dealId, to: 'X.4', reason: 'Not a fit after the first contact' },
        { contexts, flush: noFlush },
      );

      expect(result).toEqual({ ok: true, from: '0.3', to: 'X.4' });
      await sql`reset role`;
      const [call] = await sql<{ status: string }[]>`
        select status::text from public.calls where id = ${fixture.a.callId}
      `;
      expect(call?.status).toBe('cancelled');
      const [event] = await sql<{ payload: Record<string, unknown> }[]>`
        select payload from public.domain_events
        where organization_id = ${world.organizationId} and type = 'commercial.call.cancelled'
      `;
      expect(event?.payload).toMatchObject({
        callId: fixture.a.callId,
        dealId: fixture.a.dealId,
        notifyLead: false,
        externalEventId: 'event-1',
      });
    });
  });

  it('applies an allowed transition and records history, timeline, audit and event', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await changeDealStage(
        claimsFor(world.users.founder),
        { dealId: fixture.a.dealId, to: 'X.1', reason: 'Client asked to pause' },
        { contexts, flush: noFlush },
      );

      expect(result).toEqual({ ok: true, from: '0.3', to: 'X.1' });
      expect(await codeOf(sql, fixture.a.dealId)).toBe('X.1');
      const [change] = await sql<{ reason: string; actor: string }[]>`
        select reason, actor_user_id as actor from public.deal_stage_changes
        where deal_id = ${fixture.a.dealId} and to_code = 'X.1'
      `;
      expect(change).toEqual({ reason: 'Client asked to pause', actor: world.users.founder });
      const [timeline] = await sql<{ kind: string; summary: { from: string; to: string } }[]>`
        select kind::text, summary from public.timeline_entries
        where deal_id = ${fixture.a.dealId} and kind = 'stage_changed'
      `;
      expect(timeline?.summary).toMatchObject({ from: '0.3', to: 'X.1' });
      const [audit] = await sql<{ action: string }[]>`
        select action from public.audit_log where resource_id = ${fixture.a.dealId}
      `;
      expect(audit?.action).toBe('deal.stage_changed');
      const [event] = await sql<{ type: string }[]>`
        select type from public.domain_events
        where organization_id = ${world.organizationId} and payload ->> 'dealId' = ${fixture.a.dealId}
      `;
      expect(event?.type).toBe('commercial.deal.stage_changed');
    });
  });

  it('refuses a disallowed transition without writing anything', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));
      const historyBefore = await countRows(sql, 'deal_stage_changes', fixture.a.dealId);

      const result = await changeDealStage(
        claimsFor(world.users.founder),
        { dealId: fixture.a.dealId, to: '2.5', reason: null },
        { contexts, flush: noFlush },
      );

      expect(result).toEqual({ ok: false, rule: 'not_allowed' });
      expect(await codeOf(sql, fixture.a.dealId)).toBe('0.3');
      expect(await countRows(sql, 'deal_stage_changes', fixture.a.dealId)).toBe(historyBefore);
      expect(await countRows(sql, 'audit_log', fixture.a.dealId)).toBe(0);
    });
  });

  it('reopens X.1 to the code before the pause', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));
      const deps = { contexts, flush: noFlush };
      const claims = claimsFor(world.users.founder);

      await changeDealStage(claims, { dealId: fixture.a.dealId, to: 'X.1', reason: null }, deps);
      expect(
        await changeDealStage(claims, { dealId: fixture.a.dealId, to: '0.2', reason: null }, deps),
      ).toEqual({ ok: false, rule: 'not_allowed' });
      expect(
        await changeDealStage(claims, { dealId: fixture.a.dealId, to: '0.3', reason: null }, deps),
      ).toEqual({ ok: true, from: 'X.1', to: '0.3' });
    });
  });

  it('reopens to the latest code when history rows share a timestamp', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      const deps = { contexts, flush: noFlush };
      const claims = claimsFor(world.users.founder);
      const [deal] = await sql<{ id: string }[]>`
        insert into public.deals (organization_id, client_id, title, pipeline_code, source)
        values (${world.organizationId}, ${world.clients.a}, 'Empresa Exemplo', '0.1', 'application')
        returning id
      `;
      const dealId = deal?.id ?? '';
      await contexts.withSystemContext((tx) =>
        applyStageChange(tx, { dealId, to: '0.2', reason: null, actor: 'system' }),
      );

      await changeDealStage(claims, { dealId, to: 'X.1', reason: null }, deps);

      expect(await changeDealStage(claims, { dealId, to: '0.2', reason: null }, deps)).toEqual({
        ok: true,
        from: 'X.1',
        to: '0.2',
      });
    });
  });

  it('manager cannot move a deal of an unassigned client and gets not_found', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await changeDealStage(
        claimsFor(world.users.manager),
        { dealId: fixture.b.dealId, to: 'X.1', reason: null },
        { contexts, flush: noFlush },
      );

      expect(result).toEqual({ ok: false, rule: 'not_found' });
      expect(await codeOf(sql, fixture.b.dealId)).toBe('0.3');
    });
  });

  it('finance cannot move deals', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await changeDealStage(
        claimsFor(world.users.finance),
        { dealId: fixture.a.dealId, to: 'X.1', reason: null },
        { contexts, flush: noFlush },
      );

      expect(result).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('evaluates against the current code locked for update', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));

      const results = await contexts.withSystemContext(async (tx) => [
        await applyStageChange(tx, {
          dealId: fixture.a.dealId,
          to: 'X.2',
          reason: null,
          actor: 'system',
        }),
        await applyStageChange(tx, {
          dealId: fixture.a.dealId,
          to: '0.4',
          reason: null,
          actor: 'system',
        }),
      ]);

      expect(results).toEqual([
        { ok: true, from: '0.3', to: 'X.2' },
        { ok: false, rule: 'not_allowed' },
      ]);
    });
  });

  it('updates tracking fields and audits the change', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await updateDealTracking(
        claimsFor(world.users.manager),
        {
          dealId: fixture.a.dealId,
          nextStep: 'Send the diagnosis proposal',
          nextStepOwnerKind: 'staff',
          nextStepOwnerUserId: world.users.manager,
          nextStepDueOn: '2026-10-20',
          estimatedValue: '12500.00',
          currency: 'EUR',
        },
        { contexts },
      );

      expect(result).toEqual({ ok: true });
      await sql`reset role`;
      const [deal] = await sql<{ next_step: string; due: string; value: string }[]>`
        select next_step, next_step_due_on::text as due, estimated_value::text as value
        from public.deals where id = ${fixture.a.dealId}
      `;
      expect(deal).toEqual({
        next_step: 'Send the diagnosis proposal',
        due: '2026-10-20',
        value: '12500.00',
      });
      expect(await countRows(sql, 'audit_log', fixture.a.dealId)).toBe(1);
    });
  });
});
