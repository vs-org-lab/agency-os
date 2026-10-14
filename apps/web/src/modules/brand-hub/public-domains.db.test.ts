import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { isSiteOrigin, issueRestrictedToken, readPublicHubByDomain } from './public';
import { updateHubSharing } from './sharing';
import { hubClaims, hubDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function addDomain(
  sql: TransactionSql,
  world: World,
  hub: { hubId: string; clientId: string },
  hostname: string,
  status: 'pending' | 'verified' | 'connected',
) {
  await sql`reset role`;
  await sql`
    insert into public.brand_hub_domains
      (organization_id, client_id, hub_id, hostname, verification_code, status)
    values (${world.organizationId}, ${hub.clientId}, ${hub.hubId}, ${hostname},
            'abcdefghijklmnopqrstuvwxyz012345', ${status}::app.brand_hub_domain_status)
  `;
}

describe('brand hub on client domains', () => {
  it(
    'domains answer only once connected',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const hubs = await createBrandHubFixture(sql, world);
        const { deps } = hubDeps(sql);
        const hubA = { hubId: hubs.a.hubId, clientId: world.clients.a };
        const hubB = { hubId: hubs.b.hubId, clientId: world.clients.b };
        await addDomain(sql, world, hubA, 'marca.cliente-a.com', 'pending');
        await addDomain(sql, world, hubB, 'marca.cliente-b.com', 'verified');

        for (const host of ['marca.cliente-a.com', 'marca.cliente-b.com', 'nada.cliente.com', '']) {
          expect(await readPublicHubByDomain(host, null, deps), host).toEqual({ status: 404 });
        }
        expect(await isSiteOrigin('https://marca.cliente-a.com', deps)).toBe(false);
      });
    },
    SLOW,
  );

  it(
    'a connected domain opens its hub with the slug, also when locked',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const hubs = await createBrandHubFixture(sql, world);
        const { deps } = hubDeps(sql);
        const hubId = hubs.a.hubId;
        await addDomain(
          sql,
          world,
          { hubId, clientId: world.clients.a },
          'marca.cliente-a.com',
          'connected',
        );

        const locked = await readPublicHubByDomain('Marca.Cliente-A.com', null, deps);
        expect(locked).toMatchObject({ status: 401, mode: 'restricted', slug: 'cliente-a' });
        expect(locked).not.toHaveProperty('hub');

        await updateHubSharing(
          hubClaims(world.users.manager),
          { hubId, slug: 'cliente-a', mode: 'public' },
          deps,
        );
        const open = await readPublicHubByDomain('marca.cliente-a.com', null, deps);
        expect(open).toMatchObject({ status: 200, slug: 'cliente-a' });
        expect(open.status === 200 && open.hub.snapshot.pages.length).toBeGreaterThan(0);
      });
    },
    SLOW,
  );

  it(
    'connected domains are allowed origins',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const hubs = await createBrandHubFixture(sql, world);
        const { deps } = hubDeps(sql);
        await addDomain(
          sql,
          world,
          { hubId: hubs.a.hubId, clientId: world.clients.a },
          'marca.cliente-a.com',
          'connected',
        );

        expect(await isSiteOrigin('https://marca.cliente-a.com', deps)).toBe(true);
        expect(await isSiteOrigin(deps.site?.origins[0] ?? '', deps)).toBe(true);
        for (const origin of [
          'http://marca.cliente-a.com',
          'https://marca.cliente-a.com:8443',
          'https://outro.cliente-a.com',
          'null',
          '',
        ]) {
          expect(await isSiteOrigin(origin, deps), origin).toBe(false);
        }
      });
    },
    SLOW,
  );

  it(
    "restricted access returns to the hub's own connected domain only",
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const hubs = await createBrandHubFixture(sql, world);
        const { deps } = hubDeps(sql);
        await addDomain(
          sql,
          world,
          { hubId: hubs.a.hubId, clientId: world.clients.a },
          'marca.cliente-a.com',
          'connected',
        );
        await addDomain(
          sql,
          world,
          { hubId: hubs.b.hubId, clientId: world.clients.b },
          'marca.cliente-b.com',
          'connected',
        );
        const decisionMaker = hubClaims(world.users.decisionMakerA, 'client');

        const own = await issueRestrictedToken(
          decisionMaker,
          'cliente-a',
          'https://marca.cliente-a.com/',
          deps,
        );
        expect(own.ok && own.redirect).toMatch(/^https:\/\/marca\.cliente-a\.com\/#token=/);

        expect(
          await issueRestrictedToken(
            decisionMaker,
            'cliente-a',
            'https://marca.cliente-b.com/',
            deps,
          ),
        ).toEqual({ ok: false, rule: 'invalid_input' });
      });
    },
    SLOW,
  );
});
