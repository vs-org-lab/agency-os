import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { verifyPassword } from './domain/passwords';
import { loadHubSharing, updateHubSharing } from './sharing';
import { hubClaims, hubDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

async function access(sql: TransactionSql, hubId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { slug: string; access_mode: string; access_version: number; password_hash: string | null }[]
  >`
    select slug, access_mode::text, access_version, password_hash from public.brand_hubs
    where id = ${hubId}
  `;
  return row;
}

describe('brand hub sharing', () => {
  it('only publishers change sharing and changes raise the access version', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const manager = hubClaims(world.users.manager);
      const hubId = hubs.a.hubId;

      expect(
        await updateHubSharing(manager, { hubId, slug: 'atlas', mode: 'password' }, deps),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await updateHubSharing(
          manager,
          { hubId, slug: 'atlas', mode: 'password', password: 'marca segura 2026' },
          deps,
        ),
      ).toEqual({ ok: true });
      let row = await access(sql, hubId);
      expect(row).toMatchObject({ slug: 'atlas', access_mode: 'password', access_version: 2 });
      expect(await verifyPassword('marca segura 2026', row?.password_hash ?? '')).toBe(true);

      expect(
        await updateHubSharing(manager, { hubId, slug: 'atlas-marca', mode: 'password' }, deps),
      ).toEqual({ ok: true });
      row = await access(sql, hubId);
      expect(row).toMatchObject({ slug: 'atlas-marca', access_version: 2 });

      expect(
        await updateHubSharing(manager, { hubId, slug: 'atlas-marca', mode: 'public' }, deps),
      ).toEqual({
        ok: true,
      });
      row = await access(sql, hubId);
      expect(row).toMatchObject({ access_mode: 'public', access_version: 3, password_hash: null });

      await sql`
        insert into public.project_staff_assignments (organization_id, client_id, project_id, user_id)
        values (${world.organizationId}, ${world.clients.a}, ${hubs.rooms.a.projectId},
                ${world.users.freelancer})
      `;
      for (const [userId, kind] of [
        [world.users.freelancer, 'internal'],
        [world.users.finance, 'internal'],
        [world.users.decisionMakerA, 'client'],
      ] as const) {
        expect(
          await updateHubSharing(
            hubClaims(userId, kind),
            { hubId, slug: 'outro', mode: 'public' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
      }
    });
  });

  it('slugs are generated unique and validated on edit', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const founder = hubClaims(world.users.founder);

      for (const slug of ['Atlas', 'at', 'atlas marca', 'a'.repeat(61)]) {
        expect(
          await updateHubSharing(founder, { hubId: hubs.a.hubId, slug, mode: 'restricted' }, deps),
        ).toEqual({ ok: false, rule: 'invalid_input' });
      }
      expect(
        await updateHubSharing(
          founder,
          { hubId: hubs.a.hubId, slug: 'cliente-b', mode: 'restricted' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_state' });
      expect(
        await updateHubSharing(
          founder,
          { hubId: hubs.a.hubId, slug: 'nova-marca', mode: 'password', password: 'curta' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('the sharing view gives the site address once published', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);

      expect(await loadHubSharing(hubClaims(world.users.manager), world.clients.a, deps)).toEqual({
        hubId: hubs.a.hubId,
        slug: 'cliente-a',
        mode: 'restricted',
        hasPassword: false,
        siteUrl: 'https://hubs.example.com/cliente-a/',
        published: true,
      });
      expect(
        (await loadHubSharing(hubClaims(world.users.founder), world.clients.b, deps))?.published,
      ).toBe(false);
      expect(
        await loadHubSharing(hubClaims(world.users.finance), world.clients.a, deps),
      ).toBeNull();
    });
  });
});
