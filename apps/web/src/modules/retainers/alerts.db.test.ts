import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRetainerFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { pendingAlerts } from './alerts';
import { lisbonMonth, previousMonth } from './domain/months';
import { sweepRetainerReviews } from './review';
import { inDays, lisbonToday, retainerClaims, retainerDeps } from './testing';
import { recordUsage } from './usage';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function reviewTasks(sql: TransactionSql, clientId: string) {
  await sql`reset role`;
  const rows = await sql<{ title: string; assignee_id: string | null }[]>`
    select title, assignee_id from public.tasks
    where client_id = ${clientId} and title like 'Rever o retainer%'
  `;
  return rows;
}

describe('retainer alerts and review', () => {
  it(
    'one usage crossing both thresholds sends both alerts once',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const month = lisbonMonth(new Date());
        expect(await pendingAlerts(retainer.retainerId, month, deps)).toEqual([]);

        expect(
          await recordUsage(
            retainerClaims(world.users.manager),
            {
              retainerId: retainer.retainerId,
              kind: 'content_pieces',
              quantity: '2.8',
              description: 'Campanha de lançamento',
            },
            deps,
          ),
        ).toEqual({ ok: true });
        expect(await pendingAlerts(retainer.retainerId, month, deps)).toEqual([
          { kind: 'content_pieces', threshold: 80, percent: 100 },
          { kind: 'content_pieces', threshold: 100, percent: 100 },
        ]);
        expect(await pendingAlerts(retainer.retainerId, month, deps)).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'alerts reset each month',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const month = lisbonMonth(new Date());
        await sql`reset role`;
        await sql`
          insert into public.retainer_alerts (retainer_id, organization_id, client_id, kind, month,
                                              threshold)
          values (${retainer.retainerId}, ${world.organizationId}, ${world.clients.a},
                  'content_pieces', ${previousMonth(month)}, 80)
        `;
        await sql`
          update public.retainer_usage set quantity = 4 where id = ${retainer.usageId}
        `;
        expect(await pendingAlerts(retainer.retainerId, month, deps)).toEqual([
          { kind: 'content_pieces', threshold: 80, percent: 83 },
        ]);
      });
    },
    SLOW,
  );

  it(
    'the review task is created once per review date',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        await sql`reset role`;
        await sql`update public.retainers set review_on = ${inDays(30)} where id = ${retainer.retainerId}`;

        expect(await sweepRetainerReviews(lisbonToday(), deps)).toBeGreaterThanOrEqual(1);
        expect(await reviewTasks(sql, world.clients.a)).toEqual([
          {
            title: expect.stringMatching(/^Rever o retainer de /),
            assignee_id: world.users.manager,
          },
        ]);
        await sweepRetainerReviews(lisbonToday(), deps);
        expect(await reviewTasks(sql, world.clients.a)).toHaveLength(1);
      });
    },
    SLOW,
  );

  it(
    'a new review date allows a new task',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        await sql`reset role`;
        await sql`update public.retainers set review_on = ${inDays(30)} where id = ${retainer.retainerId}`;
        await sweepRetainerReviews(lisbonToday(), deps);
        await sql`reset role`;
        await sql`update public.retainers set review_on = ${inDays(45)} where id = ${retainer.retainerId}`;
        await sweepRetainerReviews(lisbonToday(), deps);
        expect(await reviewTasks(sql, world.clients.a)).toHaveLength(2);

        await sql`reset role`;
        await sql`update public.retainers set review_on = ${inDays(200)} where id = ${retainer.retainerId}`;
        await sweepRetainerReviews(lisbonToday(), deps);
        expect(await reviewTasks(sql, world.clients.a)).toHaveLength(2);
      });
    },
    SLOW,
  );
});
