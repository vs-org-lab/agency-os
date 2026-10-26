import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { createDueFollowUps } from './sweep';

afterAll(async () => {
  await closeTestSql();
});

const CALL_DAY = new Date('2026-10-12T15:00:00Z');

function daysAfter(days: number): Date {
  return new Date(CALL_DAY.getTime() + days * 86_400_000 - 6 * 3_600_000);
}

async function heldCall(sql: TransactionSql, world: World, code = '0.4') {
  const [contact] = await sql<{ id: string }[]>`
    insert into public.contacts (organization_id, client_id, full_name, email, role)
    values (${world.organizationId}, ${world.clients.a}, 'Ana Costa', 'ana@empresa.pt', 'decision_maker')
    returning id
  `;
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${world.organizationId}, ${world.clients.a}, 'Empresa Exemplo', ${code}, 'application')
    returning id
  `;
  await sql`
    insert into public.calls (organization_id, client_id, deal_id, contact_id, host_user_id,
                              starts_at, ends_at, status, outcome)
    values (${world.organizationId}, ${world.clients.a}, ${deal?.id ?? ''}, ${contact?.id ?? ''},
            ${world.users.founder}, ${CALL_DAY.toISOString()}::timestamptz - interval '45 minutes',
            ${CALL_DAY.toISOString()}::timestamptz, 'completed', 'follow_up')
  `;
  await sql`
    insert into public.timeline_entries (organization_id, client_id, deal_id, kind, created_at)
    values (${world.organizationId}, ${world.clients.a}, ${deal?.id ?? ''}, 'call_completed', ${CALL_DAY.toISOString()})
  `;
  return deal?.id ?? '';
}

async function followUpDays(sql: TransactionSql, dealId: string): Promise<number[]> {
  const rows = await sql<{ day: number }[]>`
    select sequence_day as day from public.follow_ups where deal_id = ${dealId} order by sequence_day
  `;
  return rows.map((row) => row.day);
}

describe('createDueFollowUps', () => {
  it('creates follow ups on days 3, 7, 14 and 30 only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const dealId = await heldCall(sql, world);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };

      await createDueFollowUps(daysAfter(2), deps);
      expect(await followUpDays(sql, dealId)).toEqual([]);
      await createDueFollowUps(daysAfter(3), deps);
      expect(await followUpDays(sql, dealId)).toEqual([3]);
      await createDueFollowUps(daysAfter(5), deps);
      expect(await followUpDays(sql, dealId)).toEqual([3]);
      await createDueFollowUps(daysAfter(7), deps);
      await createDueFollowUps(daysAfter(14), deps);
      await createDueFollowUps(daysAfter(30), deps);
      expect(await followUpDays(sql, dealId)).toEqual([3, 7, 14, 30]);

      const [message] = await sql<{ message: string }[]>`
        select suggested_message as message from public.follow_ups where deal_id = ${dealId} and sequence_day = 3
      `;
      expect(message?.message).toContain('Ana');
    });
  });

  it('ignores follow up entries when measuring inactivity', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const dealId = await heldCall(sql, world);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };

      await createDueFollowUps(daysAfter(3), deps);
      await createDueFollowUps(daysAfter(7), deps);

      expect(await followUpDays(sql, dealId)).toEqual([3, 7]);
    });
  });

  it('restarts the count after new activity on the deal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const dealId = await heldCall(sql, world);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };
      await sql`
        insert into public.timeline_entries (organization_id, client_id, deal_id, kind, created_at)
        values (${world.organizationId}, ${world.clients.a}, ${dealId}, 'stage_changed', ${daysAfter(2).toISOString()})
      `;

      await createDueFollowUps(daysAfter(3), deps);
      expect(await followUpDays(sql, dealId)).toEqual([]);
    });
  });

  it('is idempotent for the same day', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const dealId = await heldCall(sql, world);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };

      await createDueFollowUps(daysAfter(3), deps);
      await createDueFollowUps(daysAfter(3), deps);

      expect(await followUpDays(sql, dealId)).toEqual([3]);
    });
  });

  it('skips deals that moved past 0.4 or closed', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const dealId = await heldCall(sql, world, 'X.4');
      const deps = { contexts: createDbContexts(testDatabase(sql)) };

      await createDueFollowUps(daysAfter(3), deps);

      expect(await followUpDays(sql, dealId)).toEqual([]);
    });
  });

  it('creates the Core follow-up five business days after 1.6 once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await sql`
        insert into public.core_findings (organization_id, client_id, engagement_id, front, title,
                                          evidence_kind, evidence_value, impact, effort, lane, owner)
        values (${world.organizationId}, ${world.clients.a}, ${core.a.engagementId}, 'gravity',
                'Sem rastreamento de conversões', 'page', 'Analytics', 'high', 'high', 'days_90', 'aurion')
      `;
      await sql`update public.deals set pipeline_code = '1.6' where id = ${core.a.dealId}`;
      await sql`update public.contacts set full_name = 'Rosa Lima' where id = ${core.a.contactId}`;
      const [entry] = await sql<{ at: string }[]>`select now() as at`;
      const enteredAt = new Date(entry?.at ?? 0);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };

      await createDueFollowUps(new Date(enteredAt.getTime() + 2 * 86_400_000), deps);
      const earlyDays = await followUpDays(sql, core.a.dealId);
      const due = new Date(enteredAt.getTime() + 8 * 86_400_000);
      await createDueFollowUps(due, deps);
      await createDueFollowUps(due, deps);

      await sql`reset role`;
      const rows = await sql<{ day: number; message: string }[]>`
        select sequence_day as day, suggested_message as message from public.follow_ups
        where deal_id = ${core.a.dealId} and sequence_day = 5
      `;
      expect(earlyDays).not.toContain(5);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.day).toBe(5);
      expect(rows[0]?.message).toContain('Sem rastreamento de conversões');
      expect(rows[0]?.message).toMatch(/^Olá Rosa,/);
    });
  });

  it('stops the call follow ups once the deal enters the Core', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const dealId = await heldCall(sql, world, '1.2');
      await sql`update public.calls set outcome = 'follow_up' where deal_id = ${dealId}`;
      const deps = { contexts: createDbContexts(testDatabase(sql)) };

      await createDueFollowUps(daysAfter(3), deps);

      expect(await followUpDays(sql, dealId)).toEqual([]);
    });
  });
});
