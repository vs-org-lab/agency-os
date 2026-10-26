import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRetainerFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { loadClientRetainerRequests } from './portal-requests';
import { requestWork } from './requests';
import { retainerClaims, retainerDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function ask(sql: TransactionSql, userId: string, retainerId: string, description: string) {
  const { deps } = retainerDeps(sql);
  const result = await requestWork(
    retainerClaims(userId, 'client'),
    { retainerId, kind: 'maintenance_hours', description, quantity: '1' },
    deps,
  );
  expect(result).toEqual({ ok: true, outcome: 'task' });
}

async function taskOf(sql: TransactionSql, description: string): Promise<string> {
  await asSystem(sql);
  const [row] = await sql<{ task_id: string }[]>`
    select task_id from public.retainer_requests where description = ${description}
  `;
  if (!row) throw new Error('The request was not stored');
  return row.task_id;
}

describe('client retainer requests', () => {
  it(
    'the client reads its own requests with derived states',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const decisionMaker = retainerClaims(world.users.decisionMakerA, 'client');
        for (const description of ['Primeiro pedido', 'Segundo pedido', 'Terceiro pedido']) {
          await ask(sql, world.users.decisionMakerA, retainer.retainerId, description);
        }
        await sql`
          update public.tasks set assignee_id = null where id = ${await taskOf(sql, 'Primeiro pedido')}
        `;
        await sql`
          update public.tasks set assignee_id = ${world.users.manager}
          where id = ${await taskOf(sql, 'Segundo pedido')}
        `;
        await sql`
          update public.tasks set status = 'done', completed_at = now()
          where id = ${await taskOf(sql, 'Terceiro pedido')}
        `;

        const requests = await loadClientRetainerRequests(decisionMaker, world.clients.a, deps);

        expect(
          Object.fromEntries(requests.map((request) => [request.description, request.state])),
        ).toEqual({
          'Primeiro pedido': 'received',
          'Segundo pedido': 'in_progress',
          'Terceiro pedido': 'done',
        });
        expect(requests.find((request) => request.state === 'done')?.completedAt).not.toBeNull();
        expect(requests.find((request) => request.state !== 'done')?.completedAt).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'another client reads none',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        await ask(sql, world.users.decisionMakerA, retainer.retainerId, 'Pedido do cliente A');

        const other = await loadClientRetainerRequests(
          retainerClaims(world.users.clientFinanceB, 'client'),
          world.clients.a,
          deps,
        );

        expect(other).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'a deleted task leaves the request received',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        await ask(sql, world.users.decisionMakerA, retainer.retainerId, 'Pedido apagado');
        await sql`delete from public.tasks where id = ${await taskOf(sql, 'Pedido apagado')}`;

        const requests = await loadClientRetainerRequests(
          retainerClaims(world.users.decisionMakerA, 'client'),
          world.clients.a,
          deps,
        );

        expect(requests).toMatchObject([{ description: 'Pedido apagado', state: 'received' }]);
      });
    },
    SLOW,
  );

  it(
    'no internal task field is returned',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        await ask(sql, world.users.operationalA, retainer.retainerId, 'Pedido operacional');

        const requests = await loadClientRetainerRequests(
          retainerClaims(world.users.operationalA, 'client'),
          world.clients.a,
          deps,
        );

        expect(requests).toHaveLength(1);
        expect(Object.keys(requests[0] ?? {}).sort()).toEqual([
          'completedAt',
          'createdAt',
          'description',
          'id',
          'state',
        ]);
      });
    },
    SLOW,
  );

  it(
    'the client reads no rows directly from retainer_requests',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        await ask(sql, world.users.decisionMakerA, retainer.retainerId, 'Pedido direto');

        await asUser(sql, world.users.decisionMakerA, { aal: 'aal1' });
        expect(await sql`select id from public.retainer_requests`).toEqual([]);
      });
    },
    SLOW,
  );
});
