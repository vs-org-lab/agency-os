import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRetainerBillingFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { dealNotice } from './notices';
import { billingDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

describe('billing notices', () => {
  it('founder alerts link a retainer request to the retainer room', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createRetainerBillingFixture(sql, world);
      const [request] = await sql<{ id: string }[]>`
        insert into public.payment_requests (organization_id, client_id, deal_id, retainer_id,
                                             retainer_month, number, label, amount, currency,
                                             locale, due_date, issuer_details, client_details)
        values (${world.organizationId}, ${world.clients.a}, ${fixture.dealId},
                ${fixture.retainer.retainerId}, '2026-10-01', 'PP-2099-0003', 'Retainer', 1500,
                'EUR', 'pt-PT', current_date, '{}'::jsonb, '{}'::jsonb)
        returning id
      `;
      const { deps } = billingDeps(sql);
      const notice = (requestId?: string) =>
        dealNotice(
          fixture.dealId,
          { contexts: deps.contexts, appBaseUrl: deps.appBaseUrl },
          requestId,
        );

      expect((await notice(request?.id))?.dealUrl).toBe(
        `https://app.aurion.test/c/${world.clients.a}/retainer`,
      );
      expect((await notice())?.dealUrl).toBe(`https://app.aurion.test/pipeline/${fixture.dealId}`);
    });
  });
});
