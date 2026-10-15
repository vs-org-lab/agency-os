import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRetainerBillingFixture,
  createRetainerFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { getClientApprovals } from '@/modules/rooms/server';
import { decideExtra, quoteExtra } from './extras';
import { loadPortalRetainer } from './portal';
import { requestWork } from './requests';
import { inDays, retainerClaims, retainerDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function rows(sql: TransactionSql, retainerId: string) {
  await sql`reset role`;
  const tasks = await sql<{ title: string; assignee_id: string | null }[]>`
    select t.title, t.assignee_id from public.tasks t
    join public.retainers r on r.project_id = t.project_id
    where r.id = ${retainerId} and t.title like 'Pedido do cliente:%'
    order by t.created_at
  `;
  const usage = await sql<{ quantity: string; extra: boolean; task_id: string | null }[]>`
    select quantity::text, extra_request_id is not null as extra, task_id
    from public.retainer_usage where retainer_id = ${retainerId} order by created_at
  `;
  const extras = await sql<{ id: string; status: string; approval_id: string | null }[]>`
    select id, status::text, approval_id from public.retainer_extra_requests
    where retainer_id = ${retainerId} order by created_at
  `;
  return { tasks, usage, extras };
}

describe('retainer requests', () => {
  it(
    'a request within the allowance becomes a task with its usage',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);

        expect(
          await requestWork(
            retainerClaims(world.users.operationalA, 'client'),
            {
              retainerId: retainer.retainerId,
              kind: 'content_pieces',
              description: 'Publicação do evento',
              quantity: '2',
            },
            deps,
          ),
        ).toEqual({ ok: true, outcome: 'task' });
        const after = await rows(sql, retainer.retainerId);
        expect(after.tasks).toEqual([
          { title: 'Pedido do cliente: Publicação do evento', assignee_id: world.users.manager },
        ]);
        expect(after.usage.at(-1)).toMatchObject({ quantity: '2.0', extra: false });
        expect(after.usage.at(-1)?.task_id).not.toBeNull();
      });
    },
    SLOW,
  );

  it(
    'a request that exactly uses up a decimal allowance is still a task',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const ask = (quantity: string) =>
          requestWork(
            retainerClaims(world.users.operationalA, 'client'),
            {
              retainerId: retainer.retainerId,
              kind: 'content_pieces',
              description: `Pedido de ${quantity}`,
              quantity,
            },
            deps,
          );

        expect(await ask('0.1')).toEqual({ ok: true, outcome: 'task' });
        expect(await ask('2.7')).toEqual({ ok: true, outcome: 'task' });
        const after = await rows(sql, retainer.retainerId);
        expect(after.extras.filter((extra) => extra.status === 'requested')).toHaveLength(1);
      });
    },
    SLOW,
  );

  it(
    'a request above it becomes an extra request',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);

        expect(
          await requestWork(
            retainerClaims(world.users.decisionMakerA, 'client'),
            {
              retainerId: retainer.retainerId,
              kind: 'content_pieces',
              description: 'Série de dez publicações',
              quantity: '10',
            },
            deps,
          ),
        ).toEqual({ ok: true, outcome: 'extra' });
        const after = await rows(sql, retainer.retainerId);
        expect(after.tasks).toEqual([]);
        expect(after.extras.map((extra) => extra.status)).toEqual(['requested', 'requested']);
        for (const [userId, kind] of [
          [world.users.clientFinanceB, 'client'],
          [world.users.manager, 'internal'],
        ] as const) {
          expect(
            await requestWork(
              retainerClaims(userId, kind),
              {
                retainerId: retainer.retainerId,
                kind: 'content_pieces',
                description: 'x',
                quantity: '1',
              },
              deps,
            ),
          ).toEqual({ ok: false, rule: 'not_found' });
        }
      });
    },
    SLOW,
  );

  it(
    'requests never exceed the allowance together',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const claims = retainerClaims(world.users.decisionMakerA, 'client');
        const ask = (description: string) =>
          requestWork(
            claims,
            { retainerId: retainer.retainerId, kind: 'content_pieces', description, quantity: '2' },
            deps,
          );

        // The test database runs on one connection, so calls interleave instead of waiting on the
        // retainer lock; in production each request is its own transaction behind that lock.
        const outcomes = [await ask('Primeira'), await ask('Segunda')];
        expect(
          outcomes.map((outcome) => (outcome.ok ? outcome.outcome : outcome.rule)).sort(),
        ).toEqual(['extra', 'task']);
        await sql`reset role`;
        const [used] = await sql<{ used: string }[]>`
          select sum(quantity)::text as used from public.retainer_usage
          where retainer_id = ${retainer.retainerId} and extra_request_id is null
        `;
        expect(Number(used?.used)).toBeLessThanOrEqual(4.8);
      });
    },
    SLOW,
  );

  it(
    'quoting creates the approval and shows in the portal approvals',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const manager = retainerClaims(world.users.manager);
        const quote = {
          extraRequestId: retainer.extraRequestId,
          amount: '150.00',
          currency: 'EUR',
        };

        expect(await quoteExtra(retainerClaims(world.users.freelancer), quote, deps)).toEqual({
          ok: false,
          rule: 'not_found',
        });
        expect(await quoteExtra(manager, { ...quote, amount: '0' }, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
        expect(await quoteExtra(manager, quote, deps)).toEqual({ ok: true });
        expect(await quoteExtra(manager, quote, deps)).toEqual({
          ok: false,
          rule: 'invalid_state',
        });
        const after = await rows(sql, retainer.retainerId);
        expect(after.extras[0]).toMatchObject({ status: 'quoted' });
        expect(after.extras[0]?.approval_id).not.toBeNull();

        const approvals = await deps.contexts.withUserContext(
          retainerClaims(world.users.decisionMakerA, 'client'),
          (tx) => getClientApprovals(tx, world.clients.a),
        );
        expect(approvals).toContainEqual(
          expect.objectContaining({ kind: 'retainer', subjectName: 'Campanha de Natal' }),
        );
      });
    },
    SLOW,
  );

  it(
    'approving creates the task and usage outside the limit; declining creates nothing',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const manager = retainerClaims(world.users.manager);
        const decisionMaker = retainerClaims(world.users.decisionMakerA, 'client');
        await quoteExtra(
          manager,
          { extraRequestId: retainer.extraRequestId, amount: '150.00', currency: 'EUR' },
          deps,
        );

        expect(
          await decideExtra(
            decisionMaker,
            { extraRequestId: retainer.extraRequestId, decision: 'approved' },
            deps,
          ),
        ).toEqual({ ok: true });
        let after = await rows(sql, retainer.retainerId);
        expect(after.extras[0]?.status).toBe('approved');
        expect(after.tasks).toEqual([
          { title: 'Pedido do cliente: Campanha de Natal', assignee_id: world.users.manager },
        ]);
        expect(after.usage.at(-1)).toMatchObject({ quantity: '1.0', extra: true });
        await sql`reset role`;
        const [approval] = await sql<{ status: string }[]>`
          select status::text from public.approvals where id = ${after.extras[0]?.approval_id ?? ''}
        `;
        expect(approval?.status).toBe('approved');

        const second = await requestWork(
          decisionMaker,
          {
            retainerId: retainer.retainerId,
            kind: 'campaigns',
            description: 'Campanha da Páscoa',
            quantity: '1',
          },
          deps,
        );
        expect(second).toEqual({ ok: true, outcome: 'extra' });
        after = await rows(sql, retainer.retainerId);
        const easter = after.extras.at(-1)?.id ?? '';
        await quoteExtra(
          manager,
          { extraRequestId: easter, amount: '90.00', currency: 'EUR' },
          deps,
        );
        expect(
          await decideExtra(decisionMaker, { extraRequestId: easter, decision: 'declined' }, deps),
        ).toEqual({ ok: true });
        after = await rows(sql, retainer.retainerId);
        expect(after.extras.at(-1)?.status).toBe('declined');
        expect(after.tasks).toHaveLength(1);
      });
    },
    SLOW,
  );

  it(
    "only the client's decision maker decides an extra request",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        await quoteExtra(
          retainerClaims(world.users.manager),
          { extraRequestId: retainer.extraRequestId, amount: '150.00', currency: 'EUR' },
          deps,
        );
        for (const [userId, kind] of [
          [world.users.operationalA, 'client'],
          [world.users.clientFinanceB, 'client'],
          [world.users.founder, 'internal'],
        ] as const) {
          expect(
            await decideExtra(
              retainerClaims(userId, kind),
              { extraRequestId: retainer.extraRequestId, decision: 'approved' },
              deps,
            ),
          ).toEqual({ ok: false, rule: 'not_found' });
        }
      });
    },
    SLOW,
  );

  it(
    'the portal view shows the month without the fee',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        await sql`
          update public.retainer_extra_requests
          set status = 'quoted', quote_amount = 150, currency = 'EUR'
          where id = ${retainer.extraRequestId}
        `;
        const { deps } = retainerDeps(sql);

        const decisionMaker = await loadPortalRetainer(
          retainerClaims(world.users.decisionMakerA, 'client'),
          world.clients.a,
          deps,
        );
        expect(decisionMaker).toMatchObject({
          decides: true,
          retainer: { id: retainer.retainerId, tier: 'Essencial' },
        });
        expect(JSON.stringify(decisionMaker)).not.toContain('1500');
        expect(
          decisionMaker?.limits.map((limit) => [limit.kind, limit.available, limit.used]),
        ).toEqual([
          ['content_pieces', 4.8, 2],
          ['maintenance_hours', 12, 0],
        ]);
        expect(decisionMaker?.extraRequests).toMatchObject([
          { quoteAmount: '150.00', currency: 'EUR' },
        ]);
        const operational = await loadPortalRetainer(
          retainerClaims(world.users.operationalA, 'client'),
          world.clients.a,
          deps,
        );
        expect(operational?.decides).toBe(false);
        expect(operational?.extraRequests).toMatchObject([
          { status: 'quoted', quoteAmount: null, currency: null },
        ]);
        expect(
          await loadPortalRetainer(
            retainerClaims(world.users.clientFinanceB, 'client'),
            world.clients.a,
            deps,
          ),
        ).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'requests are suspended by a payment more than 30 days overdue',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createRetainerBillingFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const [overdue] = await sql<{ id: string }[]>`
          insert into public.payment_requests (organization_id, client_id, deal_id, retainer_id,
                                               retainer_month, number, label, amount, currency,
                                               locale, due_date, issuer_details, client_details)
          values (${world.organizationId}, ${world.clients.a}, ${fixture.dealId},
                  ${fixture.retainer.retainerId}, '2026-01-01', 'PP-2099-0001', 'Retainer', 1500,
                  'EUR', 'pt-PT', ${inDays(-31)}, '{}'::jsonb, '{}'::jsonb)
          returning id
        `;
        const ask = () =>
          requestWork(
            retainerClaims(world.users.decisionMakerA, 'client'),
            {
              retainerId: fixture.retainer.retainerId,
              kind: 'content_pieces',
              description: 'Publicação',
              quantity: '0.1',
            },
            deps,
          );
        const due = (date: string, status: string) =>
          sql`
            update public.payment_requests
            set due_date = ${date}, status = ${status}::app.payment_request_status
            where id = ${overdue?.id ?? ''}
          `;

        expect(await ask()).toEqual({ ok: false, rule: 'suspended' });
        await sql`
          insert into public.payments (organization_id, client_id, request_id, amount, currency,
                                       method, reference, received_on, status)
          values (${world.organizationId}, ${world.clients.a}, ${overdue?.id ?? ''}, 1500, 'EUR',
                  'bank_transfer', 'TRF 1', current_date, 'review')
        `;
        expect(await ask()).toEqual({ ok: true, outcome: 'task' });
        await sql`delete from public.payments where request_id = ${overdue?.id ?? ''}`;
        expect(await ask()).toEqual({ ok: false, rule: 'suspended' });
        const portal = await loadPortalRetainer(
          retainerClaims(world.users.decisionMakerA, 'client'),
          world.clients.a,
          deps,
        );
        expect(portal?.suspended).toBe(true);

        await due(inDays(-30), 'sent');
        expect(await ask()).toEqual({ ok: true, outcome: 'task' });
        await due(inDays(-31), 'paid');
        expect(await ask()).toEqual({ ok: true, outcome: 'task' });
        await due(inDays(-31), 'void');
        expect(await ask()).toEqual({ ok: true, outcome: 'task' });
        expect(
          (
            await loadPortalRetainer(
              retainerClaims(world.users.decisionMakerA, 'client'),
              world.clients.a,
              deps,
            )
          )?.suspended,
        ).toBe(false);
      });
    },
    SLOW,
  );
});
