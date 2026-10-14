import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createBrandHubFixture,
  createFixtureWorld,
  withTestTransaction,
  type World,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function insertDomain(
  sql: TransactionSql,
  world: World,
  hub: { hubId: string; clientId: string },
  hostname: string,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.brand_hub_domains
      (organization_id, client_id, hub_id, hostname, verification_code)
    values (${world.organizationId}, ${hub.clientId}, ${hub.hubId}, ${hostname},
            'abcdefghijklmnopqrstuvwxyz012345')
    returning id
  `;
  if (!row) throw new Error('domain not inserted');
  return row.id;
}

async function visibleDomains(sql: TransactionSql): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from public.brand_hub_domains`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

describe('brand hub domains', () => {
  it('hub editors read domains, other staff and clients do not', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const a = await insertDomain(
        sql,
        world,
        { hubId: hubs.a.hubId, clientId: world.clients.a },
        'marca.cliente-a.com',
      );
      const b = await insertDomain(
        sql,
        world,
        { hubId: hubs.b.hubId, clientId: world.clients.b },
        'marca.cliente-b.com',
      );

      await asUser(sql, world.users.founder);
      expect(await visibleDomains(sql)).toEqual([a, b].sort());

      await asUser(sql, world.users.finance);
      expect(await visibleDomains(sql)).toEqual([]);

      await asUser(sql, world.users.decisionMakerA);
      expect(await visibleDomains(sql)).toEqual([]);
    });
  });

  it('hostnames are unique across hubs and must be well formed', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      const hubA = { hubId: hubs.a.hubId, clientId: world.clients.a };
      const hubB = { hubId: hubs.b.hubId, clientId: world.clients.b };
      await insertDomain(sql, world, hubA, 'marca.cliente.com');

      await expect(
        sql.savepoint((tx) => insertDomain(tx, world, hubB, 'marca.cliente.com')),
      ).rejects.toThrow(/brand_hub_domains_hostname_key/);
      for (const hostname of [
        'cliente.com',
        'Marca.Cliente.com',
        'marca_x.cliente.com',
        '1.2.3.4',
      ]) {
        await expect(
          sql.savepoint((tx) => insertDomain(tx, world, hubB, hostname)),
        ).rejects.toThrow(/brand_hub_domains_hostname_format/);
      }
    });
  });

  it('authenticated users cannot write domains', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const hubs = await createBrandHubFixture(sql, world);
      await asUser(sql, world.users.founder);
      await expect(
        sql.savepoint((tx) =>
          insertDomain(
            tx,
            world,
            { hubId: hubs.a.hubId, clientId: world.clients.a },
            'marca.cliente.com',
          ),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
