import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { confirmHubAsset, removeHubAsset, requestHubAssetUpload, sweepHubAssets } from './assets';
import { hubClaims, hubDeps, HUB_TEST_NOW, JPEG_WITH_GPS, PDF_BYTES, PNG_BYTES } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const UPLOAD_PREFIX = 'memory://upload/';

async function asset(sql: TransactionSql, assetId: string) {
  await sql`reset role`;
  const [row] = await sql<{ upload_status: string; mime_type: string | null; removed: boolean }[]>`
    select upload_status::text, mime_type, removed_at is not null as removed
    from public.brand_hub_assets where id = ${assetId}
  `;
  return row;
}

describe('brand hub assets', () => {
  it('assets are verified on confirmation', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps, storage } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);
      const hubId = hubs.a.hubId;

      const png = await requestHubAssetUpload(
        manager,
        { hubId, name: 'simbolo.png', sizeBytes: PNG_BYTES.length },
        deps,
      );
      if (!png.ok) throw new Error('Upload was not requested');
      storage.files.set(png.uploadUrl.slice(UPLOAD_PREFIX.length), PNG_BYTES);
      expect(await confirmHubAsset(manager, { assetId: png.assetId }, deps)).toEqual({ ok: true });
      expect(await asset(sql, png.assetId)).toEqual({
        upload_status: 'ready',
        mime_type: 'image/png',
        removed: false,
      });

      const fake = await requestHubAssetUpload(
        manager,
        { hubId, name: 'falso.png', sizeBytes: PDF_BYTES.length },
        deps,
      );
      if (!fake.ok) throw new Error('Upload was not requested');
      const fakePath = fake.uploadUrl.slice(UPLOAD_PREFIX.length);
      storage.files.set(fakePath, PDF_BYTES);
      expect(await confirmHubAsset(manager, { assetId: fake.assetId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_file',
      });
      expect(storage.removed).toContain(fakePath);

      const video = await requestHubAssetUpload(
        manager,
        { hubId, name: 'filme.mp4', sizeBytes: 100 },
        deps,
      );
      expect(video).toEqual({ ok: false, rule: 'invalid_input' });
      for (const name of ['setup.exe', '../logo.png', '']) {
        expect(await requestHubAssetUpload(manager, { hubId, name, sizeBytes: 10 }, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
      }

      const short = await requestHubAssetUpload(
        manager,
        { hubId, name: 'curto.png', sizeBytes: 999 },
        deps,
      );
      if (!short.ok) throw new Error('Upload was not requested');
      const shortPath = short.uploadUrl.slice(UPLOAD_PREFIX.length);
      storage.files.set(shortPath, PNG_BYTES);
      expect(await confirmHubAsset(manager, { assetId: short.assetId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_file',
      });
      expect((await asset(sql, short.assetId))?.upload_status).toBe('rejected');
      expect(storage.removed).toContain(shortPath);
    });
  });

  it('a type the hub does not accept is rejected on confirmation', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps, storage } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);
      const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);

      const upload = await requestHubAssetUpload(
        manager,
        { hubId: hubs.a.hubId, name: 'logo.png', sizeBytes: webm.length },
        deps,
      );
      if (!upload.ok) throw new Error('Upload was not requested');
      storage.files.set(upload.uploadUrl.slice(UPLOAD_PREFIX.length), webm);
      expect(await confirmHubAsset(manager, { assetId: upload.assetId }, deps)).toEqual({
        ok: false,
        rule: 'invalid_file',
      });
    });
  });

  it('hub assets count against the organisation quota', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      await sql`reset role`;
      await sql`
        insert into public.brand_hub_assets (hub_id, organization_id, client_id, name, mime_type,
                                             size_bytes, storage_path, upload_status, removed_at)
        select ${hubs.a.hubId}, ${world.organizationId}, ${world.clients.a}, 'grande-' || n || '.zip',
               'application/zip', 50000000, 'brand-hub/big-' || n, 'ready', now()
        from generate_series(1, 18) n
      `;
      expect(
        await requestHubAssetUpload(
          manager,
          { hubId: hubs.a.hubId, name: 'pacote.zip', sizeBytes: 50_000_000 },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'storage_full' });
    });
  });

  it('removing an asset clears it from draft blocks', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      expect(await removeHubAsset(manager, { assetId: hubs.a.logoAssetId }, deps)).toEqual({
        ok: true,
      });
      expect((await asset(sql, hubs.a.logoAssetId))?.removed).toBe(true);
      const [block] = await sql<{ content: { assetId: string | null } }[]>`
        select content from public.brand_hub_blocks where id = ${hubs.a.logoBlockId}
      `;
      expect(block?.content.assetId).toBeNull();
      expect(
        await removeHubAsset(
          hubClaims(world.users.finance),
          { assetId: hubs.a.draftAssetId },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('the sweep keeps assets of the current publication', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps, storage } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      await removeHubAsset(manager, { assetId: hubs.a.logoAssetId }, deps);
      await removeHubAsset(manager, { assetId: hubs.a.draftAssetId }, deps);
      await sql`reset role`;
      const [stale] = await sql<{ id: string; storage_path: string }[]>`
        insert into public.brand_hub_assets (hub_id, organization_id, client_id, name, size_bytes,
                                             storage_path, created_at)
        values (${hubs.a.hubId}, ${world.organizationId}, ${world.clients.a}, 'parado.png', 10,
                'brand-hub/stale', ${new Date(HUB_TEST_NOW.getTime() - 4 * 3_600_000).toISOString()})
        returning id, storage_path
      `;

      const swept = await sweepHubAssets(deps);
      expect(swept.closed).toBeGreaterThanOrEqual(1);
      expect(await asset(sql, hubs.a.logoAssetId)).toMatchObject({ removed: true });
      expect(await asset(sql, hubs.a.draftAssetId)).toBeUndefined();
      expect((await asset(sql, stale?.id ?? ''))?.upload_status).toBe('rejected');
      expect(storage.removed).toContain(
        `brand-hub/${world.organizationId}/${world.clients.a}/${hubs.a.draftAssetId}`,
      );
      expect(storage.removed).not.toContain(
        `brand-hub/${world.organizationId}/${world.clients.a}/${hubs.a.logoAssetId}`,
      );
    });
  });

  it('a late confirmation never removes a settled file', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps, storage } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      const upload = await requestHubAssetUpload(
        manager,
        { hubId: hubs.a.hubId, name: 'tarde.png', sizeBytes: PNG_BYTES.length },
        deps,
      );
      if (!upload.ok) throw new Error('Upload was not requested');
      const path = upload.uploadUrl.slice(UPLOAD_PREFIX.length);
      storage.files.set(path, PNG_BYTES);
      expect(await confirmHubAsset(manager, { assetId: upload.assetId }, deps)).toEqual({
        ok: true,
      });
      storage.files.set(path, PDF_BYTES.slice(0, 4));
      expect(await confirmHubAsset(manager, { assetId: upload.assetId }, deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });
      expect(storage.removed).not.toContain(path);
      expect((await asset(sql, upload.assetId))?.upload_status).toBe('ready');
    });
  });

  it('confirmed hub images are stored without metadata', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps, storage } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      const upload = await requestHubAssetUpload(
        manager,
        { hubId: hubs.a.hubId, name: 'foto.jpg', sizeBytes: JPEG_WITH_GPS.length },
        deps,
      );
      if (!upload.ok) throw new Error('Upload was not requested');
      const path = upload.uploadUrl.slice(UPLOAD_PREFIX.length);
      storage.files.set(path, JPEG_WITH_GPS);
      expect(await confirmHubAsset(manager, { assetId: upload.assetId }, deps)).toEqual({
        ok: true,
      });

      const stored = storage.files.get(path);
      expect(stored && Buffer.from(stored).includes(Buffer.from('GPS'))).toBe(false);
      await sql`reset role`;
      const [row] = await sql<{ size_bytes: number; stripped: boolean }[]>`
        select size_bytes::int as size_bytes, metadata_stripped_at is not null as stripped
        from public.brand_hub_assets where id = ${upload.assetId}
      `;
      expect(row).toEqual({ size_bytes: stored?.length, stripped: true });
    });
  });

  it('the sweep strips images uploaded before this change', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps, storage } = hubDeps(sql);
      const path = `brand-hub/${world.organizationId}/${world.clients.a}/${hubs.a.logoAssetId}`;
      await sql`reset role`;
      await sql`
        update public.brand_hub_assets set mime_type = 'image/jpeg', size_bytes = ${JPEG_WITH_GPS.length}
        where id = ${hubs.a.logoAssetId}
      `;
      storage.files.set(path, JPEG_WITH_GPS);

      const swept = await sweepHubAssets(deps);
      expect(swept.stripped).toBeGreaterThanOrEqual(1);
      const stored = storage.files.get(path);
      expect(stored && Buffer.from(stored).includes(Buffer.from('GPS'))).toBe(false);
      const [row] = await sql<{ stripped: boolean }[]>`
        select metadata_stripped_at is not null as stripped from public.brand_hub_assets
        where id = ${hubs.a.logoAssetId}
      `;
      expect(row?.stripped).toBe(true);
    });
  });
});
