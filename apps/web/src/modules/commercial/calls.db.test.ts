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
import { recordCallOutcome, scheduleCallManually, type CallDeps } from './calls';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

function depsFor(sql: TransactionSql): CallDeps {
  return {
    contexts: createDbContexts(testDatabase(sql)),
    calendar: async () => null,
    flush: async () => {},
  };
}

async function dealCode(sql: TransactionSql, dealId: string) {
  await sql`reset role`;
  const [row] = await sql<{ code: string; lost: string | null }[]>`
    select pipeline_code::text as code, lost_reason as lost from public.deals where id = ${dealId}
  `;
  return row;
}

describe('calls', () => {
  it('completed requires an outcome', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);

      const result = await recordCallOutcome(
        claimsFor(world.users.founder),
        { callId: fixture.a.callId, status: 'completed', outcome: null, reason: null, notes: null },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: false, rule: 'outcome_required' });
    });
  });

  it('decline closes the deal at X.4 with the reason', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const deps = depsFor(sql);

      expect(
        await recordCallOutcome(
          claimsFor(world.users.founder),
          {
            callId: fixture.a.callId,
            status: 'completed',
            outcome: 'decline',
            reason: null,
            notes: null,
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'reason_required' });

      const result = await recordCallOutcome(
        claimsFor(world.users.founder),
        {
          callId: fixture.a.callId,
          status: 'completed',
          outcome: 'decline',
          reason: 'Sem orçamento este ano',
          notes: 'Voltar a falar em 2027',
        },
        deps,
      );

      expect(result).toEqual({ ok: true });
      expect(await dealCode(sql, fixture.a.dealId)).toEqual({
        code: 'X.4',
        lost: 'Sem orçamento este ano',
      });
      const [event] = await sql<{ type: string }[]>`
        select type from public.domain_events
        where organization_id = ${world.organizationId} and type = 'commercial.call.completed'
      `;
      expect(event).toBeDefined();
    });
  });

  it('advance outcome moves the deal to 1.1 and follow up to 0.4', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const deps = depsFor(sql);

      await recordCallOutcome(
        claimsFor(world.users.founder),
        {
          callId: fixture.a.callId,
          status: 'completed',
          outcome: 'advance',
          reason: null,
          notes: null,
        },
        deps,
      );
      await recordCallOutcome(
        claimsFor(world.users.founder),
        {
          callId: fixture.b.callId,
          status: 'completed',
          outcome: 'follow_up',
          reason: null,
          notes: null,
        },
        deps,
      );

      expect((await dealCode(sql, fixture.a.dealId))?.code).toBe('1.1');
      expect((await dealCode(sql, fixture.b.dealId))?.code).toBe('0.4');
    });
  });

  it('advance moves a deal that already has a Core engagement to 1.1', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      const result = await recordCallOutcome(
        claimsFor(world.users.founder),
        { callId: core.a.callId, status: 'completed', outcome: 'advance', reason: null, notes: null },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: true });
      expect((await dealCode(sql, core.a.dealId))?.code).toBe('1.1');
    });
  });

  it('manual scheduling moves 0.2 to 0.3', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      await sql`update public.calls set status = 'cancelled' where id = ${fixture.a.callId}`;
      await sql`select set_config('app.stage_change_reason', 'fixture', true)`;
      await sql`update public.deals set pipeline_code = '0.2' where id = ${fixture.a.dealId}`;

      const result = await scheduleCallManually(
        claimsFor(world.users.manager),
        {
          dealId: fixture.a.dealId,
          start: new Date(Date.now() + 3 * 86_400_000),
          durationMinutes: 45,
        },
        depsFor(sql),
      );

      expect(result).toMatchObject({ ok: true });
      expect((await dealCode(sql, fixture.a.dealId))?.code).toBe('0.3');
    });
  });

  it('a proposal session can be scheduled while the discovery call is scheduled', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const deps = depsFor(sql);
      const start = new Date(Date.now() + 4 * 86_400_000);

      const session = await scheduleCallManually(
        claimsFor(world.users.founder),
        { dealId: fixture.a.dealId, start, durationMinutes: 60, kind: 'proposal_session' },
        deps,
      );
      const duplicate = await scheduleCallManually(
        claimsFor(world.users.founder),
        { dealId: fixture.a.dealId, start, durationMinutes: 60, kind: 'proposal_session' },
        deps,
      );
      const discovery = await scheduleCallManually(
        claimsFor(world.users.founder),
        { dealId: fixture.a.dealId, start, durationMinutes: 45 },
        deps,
      );

      expect(session).toMatchObject({ ok: true });
      expect(duplicate).toEqual({ ok: false, rule: 'already_scheduled' });
      expect(discovery).toEqual({ ok: false, rule: 'already_scheduled' });
      await sql`reset role`;
      const kinds = await sql<{ kind: string }[]>`
        select kind::text from public.calls where deal_id = ${fixture.a.dealId} and status = 'scheduled'
        order by kind
      `;
      expect(kinds.map((row) => row.kind)).toEqual(['discovery', 'proposal_session']);
    });
  });

  it('finance cannot record outcomes', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);

      const result = await recordCallOutcome(
        claimsFor(world.users.finance),
        {
          callId: fixture.a.callId,
          status: 'completed',
          outcome: 'advance',
          reason: null,
          notes: null,
        },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
