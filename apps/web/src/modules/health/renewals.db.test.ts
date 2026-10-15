import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createContractFixture,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { sweepRenewals } from './renewals';
import { healthDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;
const TODAY = '2026-10-15';

async function signContract(sql: TransactionSql, world: World, signedAt: string) {
  const contracts = await createContractFixture(sql, world);
  await sql`
    update public.contracts set status = 'signed', signed_at = ${signedAt}
    where id = ${contracts.a.contractId}
  `;
}

async function renewalTasks(sql: TransactionSql, clientId: string) {
  await sql`reset role`;
  return sql<{ id: string; assignee_id: string | null; due_on: string; notes: string }[]>`
    select id, assignee_id, due_on::text, notes from public.tasks
    where client_id = ${clientId} and title = 'Enviar caixa de celebração da renovação'
  `;
}

describe('renewal milestones', () => {
  it(
    'the renewal sweep creates one task per client and year',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        await signContract(sql, world, '2025-10-13T10:00:00Z');
        const { deps } = healthDeps(sql);

        await sweepRenewals(TODAY, deps);
        await sweepRenewals(TODAY, deps);

        const tasks = await renewalTasks(sql, world.clients.a);
        expect(tasks).toHaveLength(1);
        expect(tasks[0]).toMatchObject({ assignee_id: world.users.manager, due_on: '2026-10-22' });
        expect(tasks[0]?.notes).toBe(
          'Caixa de celebração da renovação: monumento, carta, espumante ou alternativa sem álcool.',
        );
        const milestones = await sql<{ year: number; task_id: string }[]>`
          select year, task_id from public.client_milestones where client_id = ${world.clients.a}
        `;
        expect(milestones).toEqual([{ year: 1, task_id: tasks[0]?.id }]);
      });
    },
    SLOW,
  );

  it(
    'the box includes the printed manual when the client has a published Brand Hub',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createBrandHubFixture(sql, world);
        await signContract(sql, world, '2024-10-15T10:00:00Z');
        const { deps } = healthDeps(sql);

        await sweepRenewals(TODAY, deps);

        const [task] = await renewalTasks(sql, world.clients.a);
        expect(task?.notes).toContain('Incluir o manual impresso do Brand Hub.');
        const [milestone] = await sql<{ year: number }[]>`
          select year from public.client_milestones where client_id = ${world.clients.a}
        `;
        expect(milestone?.year).toBe(2);
      });
    },
    SLOW,
  );

  it(
    'archived clients and the signing day itself get no task',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        await signContract(sql, world, '2026-10-15T09:00:00Z');
        const { deps } = healthDeps(sql);

        await sweepRenewals(TODAY, deps);
        expect(await renewalTasks(sql, world.clients.a)).toEqual([]);

        await sql`update public.contracts set signed_at = '2025-10-15T09:00:00Z' where client_id = ${world.clients.a}`;
        await sql`update public.clients set lifecycle = 'former' where id = ${world.clients.a}`;
        await sweepRenewals(TODAY, deps);
        expect(await renewalTasks(sql, world.clients.a)).toEqual([]);
      });
    },
    SLOW,
  );
});
