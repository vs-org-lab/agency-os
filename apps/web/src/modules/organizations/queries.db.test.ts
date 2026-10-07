import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { findOrganizationName, findVisibleClient, listVisibleClients } from './queries';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  };
}

describe('organization queries', () => {
  it('lists only clients the user can access, ordered by name', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const forManager = await withUserContext(claimsFor(world.users.manager), listVisibleClients);
      const forFounder = await withUserContext(claimsFor(world.users.founder), listVisibleClients);

      expect(forManager.map((client) => client.id)).toEqual([world.clients.a]);
      expect(forFounder.map((client) => client.name)).toEqual(['Client A', 'Client B']);
    });
  });

  it('excludes prospect clients from the client list and from rooms', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`update public.clients set lifecycle = 'prospect' where id = ${world.clients.b}`;
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const result = await withUserContext(claimsFor(world.users.founder), async (tx) => ({
        list: await listVisibleClients(tx),
        prospect: await findVisibleClient(tx, world.clients.b),
      }));

      expect(result.list.map((client) => client.id)).toEqual([world.clients.a]);
      expect(result.prospect).toBeNull();
    });
  });

  it('returns null for a client outside the user scope', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const result = await withUserContext(claimsFor(world.users.decisionMakerA), async (tx) => ({
        own: await findVisibleClient(tx, world.clients.a),
        other: await findVisibleClient(tx, world.clients.b),
        organization: await findOrganizationName(tx, world.organizationId),
      }));

      expect(result.own?.name).toBe('Client A');
      expect(result.other).toBeNull();
      expect(result.organization).toMatch(/^Fixture /);
    });
  });
});
