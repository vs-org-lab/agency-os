import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { portalHubManual } from './manual';
import { publicHubManual } from './public';
import { updateHubSharing } from './sharing';
import { hubClaims, hubDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

function countingDeps(sql: TransactionSql) {
  const { deps, storage } = hubDeps(sql);
  const uploads: string[] = [];
  const upload = storage.upload;
  storage.upload = async (path, bytes, contentType) => {
    uploads.push(path);
    await upload(path, bytes, contentType);
  };
  return { deps, storage, uploads };
}

async function republish(sql: TransactionSql, hubId: string): Promise<string> {
  await sql`reset role`;
  const [row] = await sql<{ id: string }[]>`
    insert into public.brand_hub_publications
      (hub_id, organization_id, client_id, number, revision, snapshot)
    select hub_id, organization_id, client_id, number + 1, revision + 1, snapshot
    from public.brand_hub_publications
    where id = (select published_publication_id from public.brand_hubs where id = ${hubId})
    returning id
  `;
  if (!row) throw new Error('publication not created');
  await sql`update public.brand_hubs set published_publication_id = ${row.id} where id = ${hubId}`;
  return row.id;
}

describe('brand hub manual', () => {
  it(
    'the manual is generated once per publication and reused',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createBrandHubFixture(sql, world);
        const { deps, storage, uploads } = countingDeps(sql);
        const decisionMaker = hubClaims(world.users.decisionMakerA, 'client');

        const first = await portalHubManual(decisionMaker, world.clients.a, deps);
        expect(first).toMatchObject({
          ok: true,
          fileName: expect.stringMatching(/-manual-de-marca\.pdf$/),
        });
        expect(uploads).toHaveLength(1);
        const path = uploads[0] ?? '';
        expect(path).toMatch(
          new RegExp(`^brand-hub/${world.organizationId}/${world.clients.a}/manual/`),
        );
        expect(
          Buffer.from(storage.files.get(path) ?? [])
            .subarray(0, 5)
            .toString(),
        ).toBe('%PDF-');
        expect(first.ok && first.url).toContain(path);

        const second = await portalHubManual(decisionMaker, world.clients.a, deps);
        expect(second).toEqual(first);
        expect(uploads).toHaveLength(1);
      });
    },
    SLOW,
  );

  it(
    'a new publication gets a new manual',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const hubs = await createBrandHubFixture(sql, world);
        const { deps, uploads } = countingDeps(sql);
        const manager = hubClaims(world.users.manager);

        await portalHubManual(manager, world.clients.a, deps);
        const publicationId = await republish(sql, hubs.a.hubId);
        await portalHubManual(manager, world.clients.a, deps);
        expect(uploads).toHaveLength(2);
        expect(uploads[1]).toContain(`/manual/${publicationId}.pdf`);
      });
    },
    SLOW,
  );

  it(
    'the manual follows the hub access mode',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const hubs = await createBrandHubFixture(sql, world);
        const { deps } = countingDeps(sql);

        expect(await publicHubManual('cliente-a', null, deps)).toEqual({ status: 401 });
        expect(await publicHubManual('nao-existe', null, deps)).toEqual({ status: 404 });
        await updateHubSharing(
          hubClaims(world.users.manager),
          { hubId: hubs.a.hubId, slug: 'cliente-a', mode: 'public' },
          deps,
        );
        expect(await publicHubManual('cliente-a', null, deps)).toMatchObject({
          status: 200,
          fileName: expect.stringMatching(/-manual-de-marca\.pdf$/),
        });
      });
    },
    SLOW,
  );

  it(
    "the portal manual needs the client's people",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createBrandHubFixture(sql, world);
        const { deps } = countingDeps(sql);

        for (const [userId, kind] of [
          [world.users.finance, 'internal'],
          [world.users.clientFinanceB, 'client'],
        ] as const) {
          expect(await portalHubManual(hubClaims(userId, kind), world.clients.a, deps)).toEqual({
            ok: false,
            rule: 'not_found',
          });
        }
        expect(
          (
            await portalHubManual(
              hubClaims(world.users.operationalA, 'client'),
              world.clients.a,
              deps,
            )
          ).ok,
        ).toBe(true);
      });
    },
    SLOW,
  );
});
