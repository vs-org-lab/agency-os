import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRetainerBillingFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { signedContractFor } from './parties';
import { billingDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

describe('payment request parties', () => {
  it(
    "parties come from the project's deal contract, else the latest signed contract, else none",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const fixture = await createRetainerBillingFixture(sql, world);
        const { deps } = billingDeps(sql);
        const find = (clientId: string, dealId: string | null) =>
          deps.contexts.withSystemContext((tx) => signedContractFor(tx, { clientId, dealId }));
        const expected = { contractId: fixture.contractId, dealId: fixture.dealId };

        expect(await find(world.clients.a, fixture.dealId)).toMatchObject(expected);
        expect(await find(world.clients.a, null)).toMatchObject(expected);
        expect(await find(world.clients.a, randomUUID())).toMatchObject(expected);
        expect((await find(world.clients.a, null))?.locale).toMatch(/^(pt-PT|en)$/);
        expect(await find(world.clients.b, null)).toBeNull();

        await sql`
          update public.proposals set client_details = null
          where id = ${fixture.contracts.a.proposalId}
        `;
        expect(await find(world.clients.a, fixture.dealId)).toBeNull();
      });
    },
    SLOW,
  );
});
