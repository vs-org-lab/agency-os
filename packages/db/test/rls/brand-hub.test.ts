import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

const sorted = (...ids: string[]) => [...ids].sort();

describe('brand hub access', () => {
  it('team reads hubs of readable rooms only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);

      await asUser(sql, world.users.founder);
      expect(await visibleIds(sql, 'brand_hubs')).toEqual(sorted(hubs.a.hubId, hubs.b.hubId));
      expect(await visibleIds(sql, 'brand_hub_assets')).toEqual(
        sorted(hubs.a.logoAssetId, hubs.a.draftAssetId),
      );

      await asUser(sql, world.users.finance);
      expect(await visibleIds(sql, 'brand_hubs')).toEqual([]);
      expect(await visibleIds(sql, 'brand_hub_publications')).toEqual([]);

      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql, 'brand_hubs')).toEqual([]);

      await sql`reset role`;
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${hubs.rooms.a.projectId},
                ${world.users.freelancer})
      `;
      await asUser(sql, world.users.freelancer);
      expect(await visibleIds(sql, 'brand_hubs')).toEqual([hubs.a.hubId]);
      expect(await visibleIds(sql, 'brand_hub_pages')).toHaveLength(9);
      expect(await visibleIds(sql, 'brand_hub_blocks')).toEqual(
        sorted(hubs.a.strategyBlockId, hubs.a.logoBlockId),
      );
    });
  });

  it('clients read the current publication and its assets only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);

      for (const userId of [world.users.decisionMakerA, world.users.operationalA]) {
        await asUser(sql, userId, { aal: 'aal1' });
        expect(await visibleIds(sql, 'portal_brand_hub_publications')).toEqual([
          hubs.a.publicationId,
        ]);
        expect(await visibleIds(sql, 'portal_brand_hub_assets')).toEqual([hubs.a.logoAssetId]);
        expect(await visibleIds(sql, 'brand_hubs')).toEqual([]);
        expect(await visibleIds(sql, 'brand_hub_blocks')).toEqual([]);
        expect(await visibleIds(sql, 'brand_hub_assets')).toEqual([]);
      }
      await asUser(sql, world.users.clientFinanceB, { aal: 'aal1' });
      expect(await visibleIds(sql, 'portal_brand_hub_publications')).toEqual([]);
      expect(await visibleIds(sql, 'portal_brand_hub_assets')).toEqual([]);
    });
  });

  it('nobody writes hubs directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createBrandHubFixture(sql, world);

      for (const [userId, aal] of [
        [world.users.founder, 'aal2'],
        [world.users.decisionMakerA, 'aal1'],
      ] as const) {
        await asUser(sql, userId, { aal });
        for (const statement of [
          sql`update public.brand_hubs set draft_revision = draft_revision + 1`,
          sql`delete from public.brand_hub_pages`,
          sql`delete from public.brand_hub_blocks`,
          sql`update public.brand_hub_assets set removed_at = now()`,
          sql`delete from public.brand_hub_publications`,
        ]) {
          await sql`savepoint probe`;
          expect(await statement.catch((error: Error) => error)).toBeInstanceOf(Error);
          await sql`rollback to savepoint probe`;
        }
      }
    });
  });
});
