import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
} from '@agency-os/db/testing';
import {
  connectHubDomain,
  loadHubDomain,
  removeHubDomain,
  setHubDomain,
  verifyHubDomain,
} from './domains';
import { hubClaims, hubDeps, memoryDomainProvider } from './testing';

/** Each case makes many round trips to the database. */
const SLOW = 120_000;

afterAll(async () => {
  await closeTestSql();
});

async function domainRow(sql: TransactionSql, hubId: string) {
  await sql`reset role`;
  const [row] = await sql<
    { hostname: string; status: string; verification_code: string; connected_at: Date | null }[]
  >`
    select hostname, status::text, verification_code, connected_at
    from public.brand_hub_domains where hub_id = ${hubId}
  `;
  return row;
}

async function setup(sql: TransactionSql) {
  const world = await createFixtureWorld(sql);
  const hubs = await createBrandHubFixture(sql, world);
  const { deps: base } = hubDeps(sql);
  const provider = memoryDomainProvider();
  const deps = { ...base, domains: provider };
  return { world, hubs, provider, deps, manager: hubClaims(world.users.manager) };
}

async function approve(sql: TransactionSql, hubId: string) {
  await sql`reset role`;
  await sql`
    update public.brand_hubs set approved_publication_id = published_publication_id
    where id = ${hubId}
  `;
}

describe('brand hub domains', () => {
  it(
    'publishers set a domain and others cannot',
    async () => {
      await withTestTransaction(async (sql) => {
        const { world, hubs, deps, manager } = await setup(sql);
        const hubId = hubs.a.hubId;

        expect(await setHubDomain(manager, { hubId, hostname: 'cliente.com' }, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
        expect(
          await setHubDomain(manager, { hubId, hostname: 'https://Marca.Cliente.com/' }, deps),
        ).toEqual({ ok: true });
        const row = await domainRow(sql, hubId);
        expect(row).toMatchObject({ hostname: 'marca.cliente.com', status: 'pending' });
        expect(row?.verification_code).toMatch(/^[A-Za-z0-9_-]{32}$/);

        const view = await loadHubDomain(manager, hubId, deps);
        expect(view).toEqual({
          available: true,
          domain: {
            hostname: 'marca.cliente.com',
            status: 'pending',
            verificationName: '_agency-os.marca.cliente.com',
            verificationCode: row?.verification_code,
            cnameTarget: 'cname.vercel-dns.com',
            configured: null,
          },
        });

        for (const [userId, kind] of [
          [world.users.finance, 'internal'],
          [world.users.decisionMakerA, 'client'],
        ] as const) {
          const claims = hubClaims(userId, kind);
          expect(
            await setHubDomain(claims, { hubId, hostname: 'outro.cliente.com' }, deps),
          ).toEqual({ ok: false, rule: 'not_found' });
          expect(await loadHubDomain(claims, hubId, deps)).toEqual({
            ok: false,
            rule: 'not_found',
          });
        }
      });
    },
    SLOW,
  );

  it(
    'a hostname used by another hub is refused',
    async () => {
      await withTestTransaction(async (sql) => {
        const { world, hubs, deps } = await setup(sql);
        const manager = hubClaims(world.users.founder);
        await setHubDomain(manager, { hubId: hubs.a.hubId, hostname: 'marca.cliente.com' }, deps);
        expect(
          await setHubDomain(manager, { hubId: hubs.b.hubId, hostname: 'marca.cliente.com' }, deps),
        ).toEqual({ ok: false, rule: 'invalid_input' });
      });
    },
    SLOW,
  );

  it(
    'verification passes only with the right code',
    async () => {
      await withTestTransaction(async (sql) => {
        const { hubs, deps, provider, manager } = await setup(sql);
        const hubId = hubs.a.hubId;
        await setHubDomain(manager, { hubId, hostname: 'marca.cliente.com' }, deps);
        const code = (await domainRow(sql, hubId))?.verification_code ?? '';

        expect(await verifyHubDomain(manager, hubId, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
          reason: 'missing',
        });
        provider.txt.set('_agency-os.marca.cliente.com', [['another-code']]);
        expect(await verifyHubDomain(manager, hubId, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
          reason: 'mismatch',
        });
        expect((await domainRow(sql, hubId))?.status).toBe('pending');

        provider.txt.set('_agency-os.marca.cliente.com', [
          ['v=other'],
          [code.slice(0, 10), code.slice(10)],
        ]);
        expect(await verifyHubDomain(manager, hubId, deps)).toEqual({ ok: true });
        expect((await domainRow(sql, hubId))?.status).toBe('verified');
        expect(await verifyHubDomain(manager, hubId, deps)).toEqual({
          ok: false,
          rule: 'invalid_state',
        });
      });
    },
    SLOW,
  );

  it(
    'verification attempts are limited',
    async () => {
      await withTestTransaction(async (sql) => {
        const { hubs, deps, manager } = await setup(sql);
        const hubId = hubs.a.hubId;
        await setHubDomain(manager, { hubId, hostname: 'marca.cliente.com' }, deps);
        for (let attempt = 0; attempt < 10; attempt += 1) {
          expect((await verifyHubDomain(manager, hubId, deps)).ok).toBe(false);
        }
        expect(await verifyHubDomain(manager, hubId, deps)).toEqual({
          ok: false,
          rule: 'rate_limited',
        });
      });
    },
    SLOW,
  );

  it(
    'connecting needs a verified domain and an approved hub',
    async () => {
      await withTestTransaction(async (sql) => {
        const { hubs, deps, provider, manager } = await setup(sql);
        const hubId = hubs.a.hubId;
        await setHubDomain(manager, { hubId, hostname: 'marca.cliente.com' }, deps);

        expect(await connectHubDomain(manager, hubId, deps)).toEqual({
          ok: false,
          rule: 'invalid_state',
        });
        const code = (await domainRow(sql, hubId))?.verification_code ?? '';
        provider.txt.set('_agency-os.marca.cliente.com', [[code]]);
        await verifyHubDomain(manager, hubId, deps);

        expect(await connectHubDomain(manager, hubId, deps)).toEqual({
          ok: false,
          rule: 'not_approved',
        });
        expect(provider.calls).toEqual([]);

        await approve(sql, hubId);
        expect(await connectHubDomain(manager, hubId, deps)).toEqual({ ok: true });
        expect(provider.calls).toEqual([['add', 'marca.cliente.com']]);
        const row = await domainRow(sql, hubId);
        expect(row?.status).toBe('connected');
        expect(row?.connected_at).not.toBeNull();

        const view = await loadHubDomain(manager, hubId, deps);
        expect(view).toMatchObject({ domain: { status: 'connected', configured: true } });
      });
    },
    SLOW,
  );

  it(
    'a refused connection keeps the domain verified with the message',
    async () => {
      await withTestTransaction(async (sql) => {
        const { hubs, deps, provider, manager } = await setup(sql);
        const hubId = hubs.a.hubId;
        await setHubDomain(manager, { hubId, hostname: 'marca.cliente.com' }, deps);
        provider.txt.set('_agency-os.marca.cliente.com', [
          [(await domainRow(sql, hubId))?.verification_code ?? ''],
        ]);
        await verifyHubDomain(manager, hubId, deps);
        await approve(sql, hubId);
        provider.refuse = 'Domain is in use by another project';

        expect(await connectHubDomain(manager, hubId, deps)).toEqual({
          ok: false,
          rule: 'provider_error',
          message: 'Domain is in use by another project',
        });
        expect((await domainRow(sql, hubId))?.status).toBe('verified');
      });
    },
    SLOW,
  );

  it(
    'changing or removing a connected domain removes it from vercel',
    async () => {
      await withTestTransaction(async (sql) => {
        const { hubs, deps, provider, manager } = await setup(sql);
        const hubId = hubs.a.hubId;
        await approve(sql, hubId);
        await setHubDomain(manager, { hubId, hostname: 'marca.cliente.com' }, deps);
        provider.txt.set('_agency-os.marca.cliente.com', [
          [(await domainRow(sql, hubId))?.verification_code ?? ''],
        ]);
        await verifyHubDomain(manager, hubId, deps);
        await connectHubDomain(manager, hubId, deps);
        const firstCode = (await domainRow(sql, hubId))?.verification_code;

        expect(await setHubDomain(manager, { hubId, hostname: 'brand.cliente.com' }, deps)).toEqual(
          {
            ok: true,
          },
        );
        const row = await domainRow(sql, hubId);
        expect(row).toMatchObject({ hostname: 'brand.cliente.com', status: 'pending' });
        expect(row?.verification_code).not.toBe(firstCode);
        expect(provider.calls).toContainEqual(['remove', 'marca.cliente.com']);

        expect(await removeHubDomain(manager, hubId, deps)).toEqual({ ok: true });
        expect(await domainRow(sql, hubId)).toBeUndefined();
        expect(provider.calls.filter((call) => call[0] === 'remove')).toHaveLength(1);
      });
    },
    SLOW,
  );

  it(
    'without a provider domains are unavailable',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const hubs = await createBrandHubFixture(sql, world);
        const { deps } = hubDeps(sql);
        const manager = hubClaims(world.users.manager);
        const hubId = hubs.a.hubId;

        expect(await loadHubDomain(manager, hubId, deps)).toEqual({
          available: false,
          domain: null,
        });
        expect(await setHubDomain(manager, { hubId, hostname: 'marca.cliente.com' }, deps)).toEqual(
          {
            ok: false,
            rule: 'unavailable',
          },
        );
      });
    },
    SLOW,
  );
});
