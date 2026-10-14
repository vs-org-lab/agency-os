import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import { signHubToken } from './domain/tokens';
import { issueRestrictedToken, publicHubZip, readPublicHub, unlockHub } from './public';
import { updateHubSharing } from './sharing';
import { hubClaims, hubDeps, HUB_TEST_NOW, HUB_TEST_SITE } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const WEEK = 7 * 24 * 3_600_000;

function token(hubId: string, mode: 'password' | 'restricted', version: number) {
  return signHubToken(
    { hubId, mode, version, expiresAt: new Date(HUB_TEST_NOW.getTime() + WEEK) },
    HUB_TEST_SITE.tokenSecret,
  );
}

describe('brand hub public site api', () => {
  it('unpublished hubs are not found', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);

      expect(await readPublicHub('cliente-b', null, deps)).toEqual({ status: 404 });
      expect(await readPublicHub('nao-existe', null, deps)).toEqual({ status: 404 });
    });
  });

  it('locked hubs leak nothing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);

      const locked = await readPublicHub('cliente-a', null, deps);
      expect(locked.status).toBe(401);
      expect(Object.keys(locked).sort()).toEqual(['clientName', 'mode', 'status']);
      expect(locked).toMatchObject({ mode: 'restricted' });
      expect(await readPublicHub('cliente-a', 'not-a-token', deps)).toMatchObject({ status: 401 });
      expect(await publicHubZip('cliente-a', null, null, deps)).toEqual({ status: 401 });
    });
  });

  it('a valid token or a public hub opens the publication with published assets only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);

      const opened = await readPublicHub('cliente-a', token(hubs.a.hubId, 'restricted', 1), deps);
      if (opened.status !== 200) throw new Error('Hub did not open');
      expect(opened.hub.snapshot.pages.map((page) => page.title)).toEqual([
        'Estratégia',
        'Logótipo',
      ]);
      expect(Object.keys(opened.hub.assetUrls)).toEqual([hubs.a.logoAssetId]);
      expect(opened.hub.assetUrls[hubs.a.logoAssetId]).toContain('ttl=900');
      expect(
        await readPublicHub('cliente-a', token(hubs.b.hubId, 'restricted', 1), deps),
      ).toMatchObject({ status: 401 });

      const zip = await publicHubZip(
        'cliente-a',
        token(hubs.a.hubId, 'restricted', 1),
        hubs.a.pageIds.logo as string,
        deps,
      );
      if (zip.status !== 200) throw new Error('Manifest is missing');
      expect(zip.manifest.entries).toHaveLength(1);
      expect(zip.manifest.entries[0]?.url).not.toContain(hubs.a.draftAssetId);

      await sql`reset role`;
      await sql`update public.brand_hubs set access_mode = 'public' where id = ${hubs.a.hubId}`;
      expect((await readPublicHub('cliente-a', null, deps)).status).toBe(200);
    });
  });

  it('tokens from an older access version are refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const old = token(hubs.a.hubId, 'restricted', 1);

      await sql`reset role`;
      await sql`update public.brand_hubs set access_version = 2 where id = ${hubs.a.hubId}`;
      expect(await readPublicHub('cliente-a', old, deps)).toMatchObject({ status: 401 });
      expect(
        await readPublicHub('cliente-a', token(hubs.a.hubId, 'password', 2), deps),
      ).toMatchObject({ status: 401 });
    });
  });

  it('the right password unlocks and attempts are limited', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      await updateHubSharing(
        hubClaims(world.users.founder),
        { hubId: hubs.a.hubId, slug: 'cliente-a', mode: 'password', password: 'marca segura 2026' },
        deps,
      );

      expect(await unlockHub('cliente-a', 'errada', '203.0.113.7', deps)).toEqual({
        ok: false,
        rule: 'invalid_input',
      });
      const unlocked = await unlockHub('cliente-a', 'marca segura 2026', '203.0.113.7', deps);
      if (!unlocked.ok) throw new Error('Hub was not unlocked');
      expect((await readPublicHub('cliente-a', unlocked.token, deps)).status).toBe(200);
      expect(await unlockHub('cliente-b', 'marca segura 2026', '203.0.113.7', deps)).toEqual({
        ok: false,
        rule: 'not_found',
      });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await unlockHub('cliente-a', 'errada', '203.0.113.7', deps);
      }
      expect(await unlockHub('cliente-a', 'marca segura 2026', '203.0.113.7', deps)).toEqual({
        ok: false,
        rule: 'rate_limited',
      });
      expect((await unlockHub('cliente-a', 'marca segura 2026', '198.51.100.4', deps)).ok).toBe(
        true,
      );
    });
  });

  it("restricted access admits the client's people and editors only", async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const back = 'https://hubs.example.com/cliente-a/';

      for (const [userId, kind] of [
        [world.users.decisionMakerA, 'client'],
        [world.users.operationalA, 'client'],
        [world.users.manager, 'internal'],
      ] as const) {
        const issued = await issueRestrictedToken(hubClaims(userId, kind), 'cliente-a', back, deps);
        if (!issued.ok) throw new Error('Token was not issued');
        expect(issued.redirect.startsWith(`${back}#token=`)).toBe(true);
        const issuedToken = issued.redirect.slice(`${back}#token=`.length);
        expect((await readPublicHub('cliente-a', issuedToken, deps)).status).toBe(200);
      }
      for (const [userId, kind] of [
        [world.users.clientFinanceB, 'client'],
        [world.users.finance, 'internal'],
        [world.users.freelancer, 'internal'],
      ] as const) {
        expect(
          await issueRestrictedToken(hubClaims(userId, kind), 'cliente-a', back, deps),
        ).toEqual({
          ok: false,
          rule: 'not_found',
        });
      }
    });
  });

  it('restricted access only returns to configured origins', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createBrandHubFixture(sql, world);
      const { deps } = hubDeps(sql);
      const decisionMaker = hubClaims(world.users.decisionMakerA, 'client');

      for (const back of [
        'https://evil.example/cliente-a/',
        'https://hubs.example.com.evil.example/',
        'javascript:alert(1)',
        'not a url',
      ]) {
        expect(await issueRestrictedToken(decisionMaker, 'cliente-a', back, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
      }
    });
  });
});
