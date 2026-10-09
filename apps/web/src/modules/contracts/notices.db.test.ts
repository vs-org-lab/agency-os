import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createContractFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts } from '@/platform/db';
import { founderNotice } from './notices';

afterAll(async () => {
  await closeTestSql();
});

describe('founderNotice', () => {
  it('names the client, the chosen option and the deal link', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contracts = await createContractFixture(sql, world);
      await sql`
        update public.proposals set status = 'accepted', accepted_option_id = ${contracts.a.optionId}
        where id = ${contracts.a.proposalId}
      `;
      const [client] = await sql<{ name: string }[]>`
        select name from public.clients where id = ${world.clients.a}
      `;

      const notice = await founderNotice(
        { dealId: contracts.a.dealId, proposalId: contracts.a.proposalId },
        { contexts: createDbContexts(testDatabase(sql)), appBaseUrl: 'https://os.example.com' },
      );

      expect(notice).toEqual({
        companyName: client?.name,
        optionName: 'Orbit essencial',
        dealUrl: `https://os.example.com/pipeline/${contracts.a.dealId}`,
      });
    });
  });

  it('returns null for an unknown deal', async () => {
    await withTestTransaction(async (sql) => {
      expect(
        await founderNotice(
          { dealId: '00000000-0000-4000-8000-000000000000' },
          { contexts: createDbContexts(testDatabase(sql)), appBaseUrl: 'https://os.example.com' },
        ),
      ).toBeNull();
    });
  });
});
