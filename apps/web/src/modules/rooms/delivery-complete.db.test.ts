import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import type { DbTransaction } from '@agency-os/db';
import {
  closeTestSql,
  createDeliveryFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { applyStageChange } from '@/modules/commercial/server';
import { createDbContexts } from '@/platform/db';
import { completeDelivery, type DeliveryDeps } from './delivery';
import { ROOMS_TEST_NOW } from './testing';

afterAll(async () => {
  await closeTestSql();
});

function deliveryDeps(sql: TransactionSql): DeliveryDeps {
  return {
    contexts: createDbContexts(testDatabase(sql)),
    moveDeal: async (tx: DbTransaction, dealId: string, code: string) => {
      const change = await applyStageChange(tx, {
        dealId,
        to: code as '2.10',
        reason: null,
        actor: 'system',
      });
      return change.ok;
    },
    now: () => ROOMS_TEST_NOW,
  };
}

async function dealCode(sql: TransactionSql, dealId: string): Promise<string | undefined> {
  const [row] = await sql<{ code: string }[]>`
    select pipeline_code::text as code from public.deals where id = ${dealId}
  `;
  return row?.code;
}

async function taskTitles(sql: TransactionSql, projectId: string): Promise<string[]> {
  const rows = await sql<{ title: string; assignee_id: string; due_on: string }[]>`
    select title, assignee_id, due_on::text from public.tasks where project_id = ${projectId}
    order by title
  `;
  return rows.map((row) => `${row.title} · ${row.due_on}`);
}

describe('delivery', () => {
  it('once every milestone is requested, delivery moves the deal to 2.10 and creates the tasks once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      const deps = deliveryDeps(sql);
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;
      await sql`
        update public.billing_milestones set status = 'requested' where deal_id = ${delivery.dealId}
      `;

      expect(await completeDelivery(delivery.projectId, deps)).toEqual({ moved: true, tasks: 2 });
      expect(await completeDelivery(delivery.projectId, deps)).toEqual({ moved: false, tasks: 0 });
      expect(await dealCode(sql, delivery.dealId)).toBe('2.10');
      expect(await taskTitles(sql, delivery.projectId)).toEqual([
        'Enviar caixa de celebração · 2026-10-19',
        'Preparar proposta de ativação · 2026-10-26',
      ]);
      const [celebration] = await sql<{ notes: string; assignee_id: string }[]>`
        select notes, assignee_id from public.tasks
        where project_id = ${delivery.projectId} and title = 'Enviar caixa de celebração'
      `;
      expect(celebration?.assignee_id).toBe(world.users.founder);
      expect(celebration?.notes).toContain('espumante ou alternativa sem álcool');
    });
  });

  it('a paused deal stays where it is and the tasks are still created', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;
      await sql`update public.billing_milestones set status = 'requested' where deal_id = ${delivery.dealId}`;
      await sql`update public.deals set pipeline_code = 'X.1' where id = ${delivery.dealId}`;

      expect(await completeDelivery(delivery.projectId, deliveryDeps(sql))).toEqual({
        moved: false,
        tasks: 2,
      });
      expect(await dealCode(sql, delivery.dealId)).toBe('X.1');
    });
  });

  it('the deal cannot reach 2.10 with a milestone still pending', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const delivery = await createDeliveryFixture(sql, world);
      await sql`update public.projects set status = 'delivered' where id = ${delivery.projectId}`;

      expect((await completeDelivery(delivery.projectId, deliveryDeps(sql))).moved).toBe(false);
      expect(await dealCode(sql, delivery.dealId)).toBe('2.9');
    });
  });
});
