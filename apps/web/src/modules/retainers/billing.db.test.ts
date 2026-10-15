import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRetainerBillingFixture,
  withTestTransaction,
  type RetainerBillingFixture,
  type World,
} from '@agency-os/db/testing';
import { issueRetainerRequests, sweepRetainerBilling } from './billing';
import { decideExtra, quoteExtra } from './extras';
import { inDays, lisbonToday, retainerClaims, retainerDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

const thisMonth = () => `${lisbonToday().slice(0, 7)}-01`;

type RequestRow = {
  label: string;
  amount: string;
  currency: string;
  retainer_month: string | null;
  retainer_extra_request_id: string | null;
  status: string;
  due_date: string;
  pdf_path: string | null;
};

async function requests(sql: TransactionSql, retainerId: string): Promise<RequestRow[]> {
  await sql`reset role`;
  return sql<RequestRow[]>`
    select label, amount::text, currency::text, retainer_month::text, retainer_extra_request_id,
           status::text, due_date::text, pdf_path
    from public.payment_requests where retainer_id = ${retainerId} order by created_at
  `;
}

async function setup(sql: TransactionSql) {
  const world = await createFixtureWorld(sql);
  const fixture = await createRetainerBillingFixture(sql, world);
  const { deps, flushes, storage } = retainerDeps(sql);
  const issue = () =>
    deps.contexts.withSystemContext((tx) =>
      issueRetainerRequests(tx, fixture.retainer.retainerId, deps),
    );
  return { world, fixture, deps, flushes, storage, issue };
}

async function approveExtra(
  world: World,
  fixture: RetainerBillingFixture,
  deps: ReturnType<typeof retainerDeps>['deps'],
) {
  const extraRequestId = fixture.retainer.extraRequestId;
  expect(
    await quoteExtra(
      retainerClaims(world.users.founder),
      { extraRequestId, amount: '150', currency: 'EUR' },
      deps,
    ),
  ).toEqual({ ok: true });
  expect(
    await decideExtra(
      retainerClaims(world.users.decisionMakerA, 'client'),
      { extraRequestId, decision: 'approved' },
      deps,
    ),
  ).toEqual({ ok: true });
}

describe('retainer billing', () => {
  it(
    'the sweep issues the month once even when run twice',
    async () => {
      await withTestTransaction(async (sql) => {
        const { fixture, deps, flushes, storage } = await setup(sql);

        await sweepRetainerBilling(deps);
        await sweepRetainerBilling(deps);

        const rows = await requests(sql, fixture.retainer.retainerId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          amount: '1500.00',
          currency: 'EUR',
          retainer_month: thisMonth(),
          retainer_extra_request_id: null,
          status: 'sent',
          due_date: inDays(7),
        });
        expect(rows[0]?.label).toMatch(/^Retainer Essencial · \p{Ll}+ de \d{4}$/u);
        expect(storage.files.has(rows[0]?.pdf_path ?? '')).toBe(true);
        expect(flushes.length).toBeGreaterThan(0);
      });
    },
    SLOW,
  );

  it(
    'the month is not billed before the start or after the end',
    async () => {
      await withTestTransaction(async (sql) => {
        const { fixture, issue } = await setup(sql);
        const retainerId = fixture.retainer.retainerId;

        await sql`
          update public.retainers set starts_on = ${`${inDays(40).slice(0, 7)}-01`}
          where id = ${retainerId}
        `;
        expect(await issue()).toEqual({ months: 0, extras: 0 });
        await sql`
          update public.retainers
          set starts_on = ${thisMonth()}, status = 'ended'
          where id = ${retainerId}
        `;
        expect(await issue()).toEqual({ months: 0, extras: 0 });
        expect(await requests(sql, retainerId)).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'a voided month is not billed again',
    async () => {
      await withTestTransaction(async (sql) => {
        const { fixture, issue } = await setup(sql);
        const retainerId = fixture.retainer.retainerId;

        expect(await issue()).toEqual({ months: 1, extras: 0 });
        await sql`update public.payment_requests set status = 'void' where retainer_id = ${retainerId}`;
        expect(await issue()).toEqual({ months: 0, extras: 0 });
        expect((await requests(sql, retainerId)).map((row) => row.status)).toEqual(['void']);
      });
    },
    SLOW,
  );

  it(
    "the month is billed in the retainer's currency",
    async () => {
      await withTestTransaction(async (sql) => {
        const { fixture, issue } = await setup(sql);
        const retainerId = fixture.retainer.retainerId;
        await sql`
          update public.retainers set currency = 'USD', monthly_fee = 900 where id = ${retainerId}
        `;

        await issue();

        expect(await requests(sql, retainerId)).toMatchObject([
          { amount: '900.00', currency: 'USD' },
        ]);
      });
    },
    SLOW,
  );

  it(
    'a retainer without a signed contract is not billed',
    async () => {
      await withTestTransaction(async (sql) => {
        const { fixture, issue } = await setup(sql);
        await sql`update public.contracts set status = 'void' where id = ${fixture.contractId}`;

        expect(await issue()).toEqual({ months: 0, extras: 0 });
        expect(await requests(sql, fixture.retainer.retainerId)).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'approving an extra request bills its quote at once',
    async () => {
      await withTestTransaction(async (sql) => {
        const { world, fixture, deps, flushes } = await setup(sql);

        await approveExtra(world, fixture, deps);

        expect(await requests(sql, fixture.retainer.retainerId)).toMatchObject([
          {
            label: 'Pedido extra: Campanha de Natal',
            amount: '150.00',
            currency: 'EUR',
            retainer_month: null,
            retainer_extra_request_id: fixture.retainer.extraRequestId,
          },
        ]);
        expect(flushes.length).toBeGreaterThan(0);
      });
    },
    SLOW,
  );

  it(
    'an approved extra without a signed contract is billed by the sweep later',
    async () => {
      await withTestTransaction(async (sql) => {
        const { world, fixture, deps, issue } = await setup(sql);
        await sql`update public.contracts set status = 'void' where id = ${fixture.contractId}`;

        await approveExtra(world, fixture, deps);
        expect(await requests(sql, fixture.retainer.retainerId)).toEqual([]);

        await sql`update public.contracts set status = 'signed' where id = ${fixture.contractId}`;
        expect(await issue()).toEqual({ months: 1, extras: 1 });
        expect(
          (await requests(sql, fixture.retainer.retainerId)).map(
            (row) => row.retainer_extra_request_id,
          ),
        ).toContain(fixture.retainer.extraRequestId);
      });
    },
    SLOW,
  );
});
