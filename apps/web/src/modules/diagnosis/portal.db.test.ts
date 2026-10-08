import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { getPortalCore, grantPortalAccess } from './portal';

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

describe('prospect portal', () => {
  it('portal home shows the empty state before sharing', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createCoreFixture(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const portal = await withUserContext(claimsFor(world.users.decisionMakerA), (tx) =>
        getPortalCore(tx, world.clients.a),
      );

      expect(portal).toEqual({ briefing: null, documents: [] });
    });
  });

  it('shows the shared briefing without internal notes', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await sql`update public.core_engagements set briefing_shared_at = now() where id = ${core.a.engagementId}`;
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const portal = await withUserContext(claimsFor(world.users.decisionMakerA), (tx) =>
        getPortalCore(tx, world.clients.a),
      );

      expect(portal.briefing?.notes).toEqual([
        { blockId: 'block_1', questionId: null, body: 'Notes' },
      ]);
      expect(portal.briefing?.guide.blocks).toHaveLength(4);
      expect(JSON.stringify(portal)).not.toContain('Transcript');
    });
  });

  it('granting access invites the decision maker once', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const invite = vi.fn(async () => ({ userId: world.users.decisionMakerA }));
      const deps = { contexts: createDbContexts(testDatabase(sql)), invite };
      const founder = claimsFor(world.users.founder);

      const first = await grantPortalAccess(founder, { dealId: core.a.dealId }, deps);
      const second = await grantPortalAccess(founder, { dealId: core.a.dealId }, deps);

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: false, rule: 'already_granted' });
      expect(invite).toHaveBeenCalledTimes(1);
      expect(invite).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: world.clients.a, role: 'decision_maker' }),
      );
      await sql`reset role`;
      const [contact] = await sql<{ portal: string | null }[]>`
        select portal_user_id as portal from public.contacts where id = ${core.a.contactId}
      `;
      expect(contact?.portal).toBe(world.users.decisionMakerA);
    });
  });

  it('a manager of another client cannot grant access', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const invite = vi.fn(async () => ({ userId: world.users.decisionMakerA }));

      const result = await grantPortalAccess(
        claimsFor(world.users.manager),
        { dealId: core.b.dealId },
        { contexts: createDbContexts(testDatabase(sql)), invite },
      );

      expect(result).toEqual({ ok: false, rule: 'not_found' });
      expect(invite).not.toHaveBeenCalled();
    });
  });
});
