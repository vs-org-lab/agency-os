import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRetainerFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { loadStaffRetainer } from './readers';
import { saveRetainer } from './retainers';
import { inDays, lisbonToday, retainerClaims, retainerDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function retainerRow(sql: TransactionSql, projectId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { tier: string; monthly_fee: string; starts_on: string; review_on: string }[]
  >`
    select tier, monthly_fee::text, starts_on::text, review_on::text
    from public.retainers where project_id = ${projectId}
  `;
  return row;
}

async function limitsOf(sql: TransactionSql, projectId: string) {
  await sql`reset role`;
  const rows = await sql<{ kind: string; monthly_limit: string }[]>`
    select l.kind::text, l.monthly_limit::text from public.retainer_limits l
    join public.retainers r on r.id = l.retainer_id
    where r.project_id = ${projectId} order by l.kind
  `;
  return rows.map((row) => [row.kind, row.monthly_limit]);
}

describe('retainers', () => {
  it(
    'room writers create and edit the retainer, others cannot',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const projectB = retainer.rooms.b.projectId;
        const input = {
          clientId: world.clients.b,
          projectId: projectB,
          tier: 'Crescimento',
          monthlyFee: '2500.00',
          currency: 'EUR',
          startsOn: lisbonToday(),
          reviewOn: inDays(365),
          limits: [
            { kind: 'content_pieces', monthlyLimit: '8' },
            { kind: 'campaigns', monthlyLimit: '1' },
          ],
        };

        for (const [userId, kind] of [
          [world.users.finance, 'internal'],
          [world.users.freelancer, 'internal'],
          [world.users.decisionMakerA, 'client'],
        ] as const) {
          expect(await saveRetainer(retainerClaims(userId, kind), input, deps)).toEqual({
            ok: false,
            rule: 'not_found',
          });
        }
        const created = await saveRetainer(retainerClaims(world.users.founder), input, deps);
        expect(created).toMatchObject({ ok: true });
        expect(await retainerRow(sql, projectB)).toMatchObject({
          tier: 'Crescimento',
          monthly_fee: '2500.00',
        });
        expect(await limitsOf(sql, projectB)).toEqual([
          ['content_pieces', '8.0'],
          ['campaigns', '1.0'],
        ]);

        expect(
          await saveRetainer(
            retainerClaims(world.users.manager),
            {
              clientId: world.clients.a,
              projectId: retainer.rooms.a.projectId,
              tier: 'Essencial Plus',
              monthlyFee: '1800.00',
              currency: 'EUR',
              startsOn: lisbonToday(),
              reviewOn: inDays(300),
              limits: [{ kind: 'maintenance_hours', monthlyLimit: '12.5' }],
            },
            deps,
          ),
        ).toMatchObject({ ok: true, id: retainer.retainerId });
        expect(await limitsOf(sql, retainer.rooms.a.projectId)).toEqual([
          ['maintenance_hours', '12.5'],
        ]);
      });
    },
    SLOW,
  );

  it(
    'retainer dates are normalised and validated',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const founder = retainerClaims(world.users.founder);
        const base = {
          clientId: world.clients.b,
          projectId: retainer.rooms.b.projectId,
          tier: 'Crescimento',
          monthlyFee: '2500.00',
          currency: 'EUR',
          startsOn: inDays(10),
          reviewOn: inDays(365),
          limits: [{ kind: 'content_pieces', monthlyLimit: '8' }],
        };

        for (const invalid of [
          { ...base, reviewOn: inDays(-1) },
          { ...base, startsOn: inDays(400), reviewOn: inDays(380) },
          { ...base, limits: [] },
          {
            ...base,
            limits: [
              { kind: 'content_pieces', monthlyLimit: '8' },
              { kind: 'content_pieces', monthlyLimit: '2' },
            ],
          },
          { ...base, limits: [{ kind: 'content_pieces', monthlyLimit: '0' }] },
          { ...base, tier: '' },
          { ...base, projectId: retainer.rooms.a.projectId },
        ]) {
          expect(await saveRetainer(founder, invalid, deps), JSON.stringify(invalid)).toEqual({
            ok: false,
            rule: 'invalid_input',
          });
        }
        expect(await saveRetainer(founder, base, deps)).toMatchObject({ ok: true });
        expect((await retainerRow(sql, base.projectId))?.starts_on).toBe(
          `${inDays(10).slice(0, 7)}-01`,
        );
      });
    },
    SLOW,
  );

  it(
    'the staff view shows the month per limit and hides the fee from freelancers',
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

        const manager = await loadStaffRetainer(
          retainerClaims(world.users.manager),
          world.clients.a,
          deps,
        );
        expect(manager?.canWrite).toBe(true);
        expect(manager?.retainer).toMatchObject({
          id: retainer.retainerId,
          tier: 'Essencial',
          monthlyFee: '1500.00',
          currency: 'EUR',
        });
        expect(manager?.limits).toEqual([
          {
            kind: 'content_pieces',
            limit: 4,
            carry: 0.8,
            available: 4.8,
            used: 2,
            remaining: 2.8,
            percent: 42,
          },
          {
            kind: 'maintenance_hours',
            limit: 10,
            carry: 2,
            available: 12,
            used: 0,
            remaining: 12,
            percent: 0,
          },
        ]);
        expect(manager?.extraRequests).toMatchObject([{ quoteAmount: '150.00', currency: 'EUR' }]);

        const freelancer = await loadStaffRetainer(
          retainerClaims(world.users.freelancer),
          world.clients.a,
          deps,
        );
        expect(freelancer?.canWrite).toBe(false);
        expect(freelancer?.retainer?.monthlyFee).toBeNull();
        expect(freelancer?.extraRequests).toMatchObject([
          { status: 'quoted', quoteAmount: null, currency: null },
        ]);
        expect(
          await loadStaffRetainer(
            retainerClaims(world.users.decisionMakerA, 'client'),
            world.clients.a,
            deps,
          ),
        ).toBeNull();
      });
    },
    SLOW,
  );
});
