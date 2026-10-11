import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { updateHubBlock } from './blocks';
import type { BrandHubDeps } from './access';
import type { HubSnapshot } from './domain/snapshot';
import { renameHubPage } from './pages';
import { publishBrandHub } from './publish';
import { hubClaims, hubDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function publication(sql: TransactionSql, publicationId: string) {
  await sql`reset role`;
  const [row] = await sql<{ number: number; revision: number; snapshot: HubSnapshot }[]>`
    select number, revision, snapshot from public.brand_hub_publications where id = ${publicationId}
  `;
  return row;
}

/** Runs `change` right before the first system-context call, standing in for another request. */
function interleave(deps: BrandHubDeps, change: () => Promise<unknown>): BrandHubDeps {
  let calls = 0;
  const base = deps.contexts.withSystemContext;
  return {
    ...deps,
    contexts: {
      ...deps.contexts,
      withSystemContext: (async (work: Parameters<typeof base>[0]) => {
        calls += 1;
        if (calls === 1) await change();
        return base(work);
      }) as typeof base,
    },
  };
}

const emptyStrategy = { story: '', vision: '', values: '', voice: '', positioning: '' };

describe('brand hub publishing', () => {
  it('publishing freezes a snapshot of the draft', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps, flushes } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      await updateHubBlock(
        manager,
        {
          blockId: hubs.a.strategyBlockId,
          content: { ...emptyStrategy, mission: 'Marcas vivas.' },
        },
        deps,
      );
      const published = await publishBrandHub(manager, { hubId: hubs.a.hubId }, deps);
      if (!published.ok) throw new Error('Hub was not published');
      expect(published.number).toBe(2);
      const row = await publication(sql, published.publicationId);
      expect(row?.snapshot.pages).toHaveLength(9);
      expect(row?.snapshot.pages[0]?.blocks[0]?.content).toMatchObject({
        mission: 'Marcas vivas.',
      });
      expect(row?.snapshot.assets.map((asset) => asset.id)).toEqual([hubs.a.logoAssetId]);

      const [hub] = await sql<{ published_publication_id: string }[]>`
        select published_publication_id from public.brand_hubs where id = ${hubs.a.hubId}
      `;
      expect(hub?.published_publication_id).toBe(published.publicationId);
      const events = await sql<{ total: number }[]>`
        select count(*)::int as total from public.domain_events
        where organization_id = ${world.organizationId} and type = 'brand_hub.published'
      `;
      expect(events[0]?.total).toBe(1);
      expect(flushes).toHaveLength(1);
    });
  });

  it('the snapshot stays fixed after edits', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      const published = await publishBrandHub(manager, { hubId: hubs.a.hubId }, deps);
      if (!published.ok) throw new Error('Hub was not published');
      const before = await publication(sql, published.publicationId);
      await renameHubPage(
        manager,
        { pageId: hubs.a.pageIds.strategy as string, title: 'Essência' },
        deps,
      );
      await updateHubBlock(
        manager,
        { blockId: hubs.a.strategyBlockId, content: { ...emptyStrategy, mission: 'Outra.' } },
        deps,
      );
      expect(await publication(sql, published.publicationId)).toEqual(before);
      expect(before?.snapshot.pages[0]?.title).toBe('Estratégia');
    });
  });

  it('publishing without changes is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      expect((await publishBrandHub(manager, { hubId: hubs.a.hubId }, deps)).ok).toBe(true);
      expect(await publishBrandHub(manager, { hubId: hubs.a.hubId }, deps)).toEqual({
        ok: false,
        rule: 'nothing_to_publish',
      });
    });
  });

  it('concurrent publishes get consecutive numbers', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      let other: Awaited<ReturnType<typeof publishBrandHub>> | null = null;
      const racing = interleave(deps, async () => {
        other = await publishBrandHub(manager, { hubId: hubs.a.hubId }, deps);
      });
      const late = await publishBrandHub(manager, { hubId: hubs.a.hubId }, racing);
      expect(other).toMatchObject({ ok: true, number: 2 });
      expect(late).toEqual({ ok: false, rule: 'nothing_to_publish' });
      await sql`reset role`;
      const numbers = await sql<{ number: number }[]>`
        select number from public.brand_hub_publications where hub_id = ${hubs.a.hubId}
        order by number
      `;
      expect(numbers.map((row) => row.number)).toEqual([1, 2]);
    });
  });

  it('freelancers cannot publish', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${hubs.rooms.a.projectId},
                ${world.users.freelancer})
      `;
      expect(
        await publishBrandHub(hubClaims(world.users.freelancer), { hubId: hubs.a.hubId }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('a new publication withdraws the pending approval', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);
      const [approval] = await sql<{ id: string }[]>`
        insert into public.approvals (organization_id, client_id, project_id, subject_type,
                                      subject_id, requested_by)
        values (${world.organizationId}, ${world.clients.a}, ${hubs.rooms.a.projectId},
                'brand_hub_publication', ${hubs.a.publicationId}, ${world.users.manager})
        returning id
      `;

      expect((await publishBrandHub(manager, { hubId: hubs.a.hubId }, deps)).ok).toBe(true);
      await sql`reset role`;
      const [row] = await sql<{ status: string }[]>`
        select status::text from public.approvals where id = ${approval?.id ?? ''}
      `;
      expect(row?.status).toBe('withdrawn');
    });
  });
});
