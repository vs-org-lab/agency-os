import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { requestHubApproval } from './approvals';
import { hubAssetUrl, loadHubEditor, loadHubPreview, loadPortalHub } from './readers';
import { hubClaims, hubDeps } from './testing';
import { hubZipManifest } from './zip';

afterAll(async () => {
  await closeTestSql();
});

describe('brand hub readers', () => {
  it('the editor view reports unpublished changes and approval state', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      const view = await loadHubEditor(manager, world.clients.a, deps);
      if (!view?.hub) throw new Error('Editor view is missing');
      expect(view.hub.pages).toHaveLength(9);
      expect(view.hub.assets.map((asset) => asset.name).sort()).toEqual(['draft.png', 'logo.svg']);
      expect(view.hub.unpublishedChanges).toBe(true);
      expect(view.hub.approval).toBe('none');
      expect(view.hub.canPublish).toBe(true);
      expect(view.hub.contrastWarning).toBe(false);
      expect(view.hub.lastPublishedAt).not.toBeNull();

      await requestHubApproval(manager, { hubId: hubs.a.hubId }, deps);
      expect((await loadHubEditor(manager, world.clients.a, deps))?.hub?.approval).toBe('pending');
    });
  });

  it('a client without a hub offers to create one to room writers only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createRoomFixture(sql, world);
      const { deps } = hubDeps(sql);

      expect(await loadHubEditor(hubClaims(world.users.manager), world.clients.a, deps)).toEqual({
        hub: null,
        canCreate: true,
      });
      expect(await loadHubEditor(hubClaims(world.users.finance), world.clients.a, deps)).toBeNull();
    });
  });

  it('the preview shows the draft to editors only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);

      const preview = await loadHubPreview(hubClaims(world.users.manager), world.clients.a, deps);
      expect(preview?.pages).toHaveLength(9);
      expect(preview?.assets.map((asset) => asset.id)).toEqual([hubs.a.logoAssetId]);
      expect(
        await loadHubPreview(
          hubClaims(world.users.decisionMakerA, 'client'),
          world.clients.a,
          deps,
        ),
      ).toBeNull();
    });
  });

  it('the portal shows the current publication only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      await requestHubApproval(hubClaims(world.users.manager), { hubId: hubs.a.hubId }, deps);

      const decisionMaker = await loadPortalHub(
        hubClaims(world.users.decisionMakerA, 'client'),
        world.clients.a,
        deps,
      );
      expect(decisionMaker?.snapshot.pages.map((page) => page.title)).toEqual([
        'Estratégia',
        'Logótipo',
      ]);
      expect(decisionMaker?.pendingApprovalId).not.toBeNull();
      expect(decisionMaker?.approved).toBe(false);
      const operational = await loadPortalHub(
        hubClaims(world.users.operationalA, 'client'),
        world.clients.a,
        deps,
      );
      expect(operational?.pendingApprovalId).toBeNull();
      expect(
        await loadPortalHub(hubClaims(world.users.decisionMakerA, 'client'), world.clients.b, deps),
      ).toBeNull();
    });
  });

  it('clients only reach published assets', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const client = hubClaims(world.users.decisionMakerA, 'client');

      expect(await hubAssetUrl(client, hubs.a.logoAssetId, deps)).toContain('ttl=900');
      expect(await hubAssetUrl(client, hubs.a.draftAssetId, deps)).toBeNull();
      expect(
        await hubAssetUrl(hubClaims(world.users.manager), hubs.a.draftAssetId, deps),
      ).toContain('download=draft.png');

      const manifest = await hubZipManifest(
        client,
        { clientId: world.clients.a, pageId: null },
        deps,
      );
      if (!manifest.ok) throw new Error('Manifest is missing');
      expect(manifest.entries.map((entry) => entry.url).join(' ')).not.toContain(
        hubs.a.draftAssetId,
      );
    });
  });

  it('zip manifests follow the current publication with standardised names', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const client = hubClaims(world.users.operationalA, 'client');
      await sql`reset role`;
      const [company] = await sql<{ name: string }[]>`
        select name from public.clients where id = ${world.clients.a}
      `;
      const name = company?.name ?? '';

      const logoPage = await hubZipManifest(
        client,
        { clientId: world.clients.a, pageId: hubs.a.pageIds.logo as string },
        deps,
      );
      if (!logoPage.ok) throw new Error('Manifest is missing');
      expect(logoPage.archiveName).toBe(`${name} - Logótipo.zip`);
      expect(logoPage.entries.map((entry) => entry.path)).toEqual([`${name}-Logótipo-logo.svg`]);
      expect(logoPage.entries[0]?.url).toContain('ttl=900');

      const all = await hubZipManifest(client, { clientId: world.clients.a, pageId: null }, deps);
      if (!all.ok) throw new Error('Manifest is missing');
      expect(all.archiveName).toBe(`${name} - Brand Hub.zip`);
      expect(all.entries.map((entry) => entry.path)).toEqual([
        `02 Logótipo/${name}-Logótipo-logo.svg`,
      ]);
    });
  });

  it('client finance and other freelancers get nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const finance = hubClaims(world.users.clientFinanceB, 'client');
      const freelancer = hubClaims(world.users.freelancer);

      expect(await loadPortalHub(finance, world.clients.b, deps)).toBeNull();
      expect(await hubAssetUrl(freelancer, hubs.a.logoAssetId, deps)).toBeNull();
      expect(await loadHubEditor(freelancer, world.clients.a, deps)).toBeNull();
      expect(
        await hubZipManifest(freelancer, { clientId: world.clients.a, pageId: null }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
