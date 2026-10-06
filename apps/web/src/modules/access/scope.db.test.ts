import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addClientMember,
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { loadAccessContext, resolveActor } from './scope';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(
  userId: string,
  options: { aal?: 'aal1' | 'aal2'; totpAt?: number } = {},
): VerifiedClaims {
  const aal = options.aal ?? 'aal2';
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: userId,
    role: 'authenticated',
    aal,
    session_id: randomUUID(),
    amr:
      aal === 'aal2'
        ? [
            { method: 'password', timestamp: now - 60 },
            { method: 'totp', timestamp: options.totpAt ?? now },
          ]
        : [{ method: 'password', timestamp: now }],
  };
}

describe('access scope', () => {
  it('resolves an internal actor with roles and mfa time from the totp claim', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withUserContext } = createDbContexts(testDatabase(sql));
      const totpAt = Math.floor(Date.now() / 1000) - 120;

      const actor = await withUserContext(claimsFor(world.users.manager, { totpAt }), (tx) =>
        resolveActor(tx, claimsFor(world.users.manager, { totpAt })),
      );

      expect(actor).toEqual({
        userId: world.users.manager,
        organizationId: world.organizationId,
        roles: ['project_manager'],
        mfaVerifiedAt: new Date(totpAt * 1000),
      });
    });
  });

  it('resolves a client actor without internal roles and without mfa', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withUserContext } = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.decisionMakerA, { aal: 'aal1' });

      const actor = await withUserContext(claims, (tx) => resolveActor(tx, claims));

      expect(actor).toEqual({
        userId: world.users.decisionMakerA,
        organizationId: world.organizationId,
        roles: [],
        mfaVerifiedAt: null,
      });
    });
  });

  it('returns null for a user without active memberships', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await sql`update public.client_memberships set status = 'revoked' where user_id = ${world.users.operationalA}`;
      const { withUserContext } = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.operationalA);

      expect(await withUserContext(claims, (tx) => resolveActor(tx, claims))).toBeNull();
    });
  });

  it('loads assigned clients and client roles per client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await addClientMember(sql, {
        organizationId: world.organizationId,
        clientId: world.clients.b,
        userId: world.users.manager,
        role: 'operational',
      });
      const { withUserContext } = createDbContexts(testDatabase(sql));
      const claims = claimsFor(world.users.manager);

      const ctx = await withUserContext(claims, async (tx) => {
        const actor = await resolveActor(tx, claims);
        if (!actor) throw new Error('Actor not resolved');
        return loadAccessContext(tx, actor);
      });

      expect([...ctx.assignedClientIds]).toEqual([world.clients.a]);
      expect(Object.fromEntries(ctx.clientRoles)).toEqual({ [world.clients.b]: ['operational'] });
    });
  });
});
