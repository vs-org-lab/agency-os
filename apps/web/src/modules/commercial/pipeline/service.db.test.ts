import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCommercialFixture,
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
