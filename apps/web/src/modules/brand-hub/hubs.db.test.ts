import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { addHubBlock, moveHubBlock, removeHubBlock, updateHubBlock } from './blocks';
import { createBrandHub, updateHubDesign } from './hubs';
import { addHubPage, moveHubPage, removeHubPage, renameHubPage, setHubPageHidden } from './pages';
import { hubClaims, hubDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function pages(sql: TransactionSql, hubId: string) {
  await sql`reset role`;
  return sql<{ id: string; title: string; hidden: boolean; kind: string }[]>`
    select id, title, hidden, kind::text from public.brand_hub_pages
    where hub_id = ${hubId} order by position
  `;
}

async function revision(sql: TransactionSql, hubId: string): Promise<number> {
  await sql`reset role`;
  const [row] = await sql<{ draft_revision: number }[]>`
    select draft_revision from public.brand_hubs where id = ${hubId}
  `;
  return Number(row?.draft_revision);
}

async function blocks(sql: TransactionSql, pageId: string) {
  await sql`reset role`;
  return sql<{ id: string; type: string; content: unknown }[]>`
    select id, type::text, content from public.brand_hub_blocks
    where page_id = ${pageId} order by position
  `;
}

describe('brand hub editing', () => {
  it('creating a hub makes the nine pages once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createRoomFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);

      const created = await createBrandHub(manager, { clientId: world.clients.a }, deps);
      if (!created.ok) throw new Error('Hub was not created');
      const created_pages = await pages(sql, created.hubId);
      expect(created_pages.map((page) => page.title)).toEqual([
        'Estratégia',
        'Galeria',
        'Logótipo',
        'Tipografia',
        'Cor',
        'Fotografia',
        'Layout',
        'Objetos de marca',
        'Recursos',
      ]);
      const strategyBlocks = await blocks(sql, created_pages[0]?.id ?? '');
      expect(strategyBlocks.map((block) => block.type)).toEqual(['strategy']);
      expect(await createBrandHub(manager, { clientId: world.clients.a }, deps)).toEqual({
        ok: false,
        rule: 'invalid_state',
      });
    });
  });

  it('pages are added, renamed, hidden, moved and removed within limits', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);
      const hubId = hubs.a.hubId;

      const added = await addHubPage(manager, { hubId, title: ' Sinalética ' }, deps);
      if (!added.ok) throw new Error('Page was not added');
      expect((await pages(sql, hubId)).at(-1)).toMatchObject({
        title: 'Sinalética',
        kind: 'custom',
      });
      expect(await renameHubPage(manager, { pageId: added.pageId, title: 'Sinais' }, deps)).toEqual(
        {
          ok: true,
        },
      );
      expect(await renameHubPage(manager, { pageId: added.pageId, title: '' }, deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      expect(
        await setHubPageHidden(
          manager,
          { pageId: hubs.a.pageIds.gallery as string, hidden: true },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(await moveHubPage(manager, { pageId: added.pageId, direction: 'up' }, deps)).toEqual({
        ok: true,
      });
      const ordered = await pages(sql, hubId);
      expect(ordered.map((page) => page.title).slice(-2)).toEqual(['Sinais', 'Recursos']);
      expect(ordered.find((page) => page.title === 'Galeria')?.hidden).toBe(true);

      expect(await removeHubPage(manager, { pageId: hubs.a.pageIds.logo as string }, deps)).toEqual(
        { ok: false, rule: 'invalid_state' },
      );
      expect(await removeHubPage(manager, { pageId: added.pageId }, deps)).toEqual({ ok: true });

      await sql`reset role`;
      await sql`
        insert into public.brand_hub_pages (hub_id, organization_id, client_id, kind, title, position)
        select ${hubId}, ${world.organizationId}, ${world.clients.a}, 'custom', 'Página ' || n,
               100 + n
        from generate_series(1, 20) n
      `;
      expect((await addHubPage(manager, { hubId, title: 'Última' }, deps)).ok).toBe(true);
      expect(await addHubPage(manager, { hubId, title: 'Excedente' }, deps)).toEqual({
        ok: false,
        rule: 'limit_reached',
      });
    });
  });

  it('blocks are validated and ordered', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);
      const pageId = hubs.a.pageIds.color as string;

      const first = await addHubBlock(manager, { pageId, type: 'colors' }, deps);
      const second = await addHubBlock(manager, { pageId, type: 'text' }, deps);
      if (!first.ok || !second.ok) throw new Error('Blocks were not added');
      const swatches = { swatches: [{ name: 'Azul', hex: '#0A2540', notes: 'Pantone 2965 C' }] };
      expect(
        await updateHubBlock(manager, { blockId: first.blockId, content: swatches }, deps),
      ).toEqual({ ok: true });
      expect(
        await updateHubBlock(
          manager,
          {
            blockId: first.blockId,
            content: { swatches: [{ name: 'X', hex: 'blue', notes: '' }] },
          },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await moveHubBlock(manager, { blockId: second.blockId, direction: 'up' }, deps),
      ).toEqual({ ok: true });
      expect((await blocks(sql, pageId)).map((block) => block.id)).toEqual([
        second.blockId,
        first.blockId,
      ]);
      expect((await blocks(sql, pageId))[1]?.content).toEqual(swatches);
      expect(await removeHubBlock(manager, { blockId: second.blockId }, deps)).toEqual({
        ok: true,
      });
      expect(await blocks(sql, pageId)).toHaveLength(1);

      await sql`reset role`;
      await sql`
        insert into public.brand_hub_blocks (page_id, hub_id, organization_id, client_id, type,
                                             position, content)
        select ${pageId}, ${hubs.a.hubId}, ${world.organizationId}, ${world.clients.a}, 'text',
               100 + n, '{"title":"","body":""}'::jsonb
        from generate_series(1, 38) n
      `;
      expect((await addHubBlock(manager, { pageId, type: 'text' }, deps)).ok).toBe(true);
      expect(await addHubBlock(manager, { pageId, type: 'text' }, deps)).toEqual({
        ok: false,
        rule: 'limit_reached',
      });
    });
  });

  it('blocks only reference ready assets of their hub', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);
      const blockId = hubs.a.logoBlockId;
      const logo = (assetId: string) => ({ assetId, variant: 'Principal', background: 'dark' });

      await sql`reset role`;
      const [foreign] = await sql<{ id: string }[]>`
        insert into public.brand_hub_assets (hub_id, organization_id, client_id, name, mime_type,
                                             size_bytes, storage_path, upload_status)
        values (${hubs.b.hubId}, ${world.organizationId}, ${world.clients.b}, 'b.png', 'image/png',
                10, 'brand-hub/b', 'ready')
        returning id
      `;
      const [uploading] = await sql<{ id: string }[]>`
        insert into public.brand_hub_assets (hub_id, organization_id, client_id, name, size_bytes,
                                             storage_path)
        values (${hubs.a.hubId}, ${world.organizationId}, ${world.clients.a}, 'w.png', 10,
                'brand-hub/w')
        returning id
      `;
      const [removed] = await sql<{ id: string }[]>`
        insert into public.brand_hub_assets (hub_id, organization_id, client_id, name, mime_type,
                                             size_bytes, storage_path, upload_status, removed_at)
        values (${hubs.a.hubId}, ${world.organizationId}, ${world.clients.a}, 'r.png', 'image/png',
                10, 'brand-hub/r', 'ready', now())
        returning id
      `;
      const [pdf] = await sql<{ id: string }[]>`
        insert into public.brand_hub_assets (hub_id, organization_id, client_id, name, mime_type,
                                             size_bytes, storage_path, upload_status)
        values (${hubs.a.hubId}, ${world.organizationId}, ${world.clients.a}, 'm.pdf',
                'application/pdf', 10, 'brand-hub/m', 'ready')
        returning id
      `;
      for (const asset of [foreign, uploading, removed]) {
        expect(
          await updateHubBlock(manager, { blockId, content: logo(asset?.id ?? '') }, deps),
        ).toEqual({ ok: false, rule: 'invalid_input' });
      }
      expect(
        await updateHubBlock(manager, { blockId, content: logo(hubs.a.draftAssetId) }, deps),
      ).toEqual({ ok: true });

      const image = await addHubBlock(
        manager,
        { pageId: hubs.a.pageIds.gallery as string, type: 'image' },
        deps,
      );
      if (!image.ok) throw new Error('Image block was not added');
      expect(
        await updateHubBlock(
          manager,
          { blockId: image.blockId, content: { assetId: pdf?.id ?? '', caption: '' } },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('every edit raises the draft revision', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);
      const hubId = hubs.a.hubId;
      const before = await revision(sql, hubId);

      await renameHubPage(
        manager,
        { pageId: hubs.a.pageIds.layout as string, title: 'Grelha' },
        deps,
      );
      await updateHubBlock(
        manager,
        {
          blockId: hubs.a.strategyBlockId,
          content: { story: 'A', mission: 'B', vision: '', values: '', voice: '', positioning: '' },
        },
        deps,
      );
      const design = {
        colors: {
          surface: '#FAFAF9',
          panel: '#F5F5F4',
          text: '#1C1917',
          textMuted: '#57534E',
          accent: '#E11D48',
          divider: '#E7E5E4',
        },
        corners: 'square',
        logoTiles: false,
        layout: 'split',
      };
      expect(await updateHubDesign(manager, { hubId, design }, deps)).toEqual({ ok: true });
      expect(
        await updateHubDesign(manager, { hubId, design: { ...design, layout: 'grid' } }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(await revision(sql, hubId)).toBe(before + 3);
    });
  });

  it('freelancers edit but cannot create hubs', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const pageId = hubs.a.pageIds.layout as string;
      const rename = (userId: string, kind: 'internal' | 'client' = 'internal') =>
        renameHubPage(hubClaims(userId, kind), { pageId, title: 'Grelha' }, deps);

      expect(await rename(world.users.freelancer)).toEqual({ ok: false, rule: 'not_found' });
      expect(await rename(world.users.finance)).toEqual({ ok: false, rule: 'not_found' });
      expect(await rename(world.users.decisionMakerA, 'client')).toEqual({
        ok: false,
        rule: 'not_found',
      });

      await sql`reset role`;
      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${hubs.rooms.a.projectId},
                ${world.users.freelancer})
      `;
      expect(await rename(world.users.freelancer)).toEqual({ ok: true });
      await sql`delete from public.brand_hubs where id = ${hubs.a.hubId}`;
      expect(
        await createBrandHub(
          hubClaims(world.users.freelancer),
          { clientId: world.clients.a },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
