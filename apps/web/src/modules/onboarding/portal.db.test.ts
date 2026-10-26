import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { markPortalOnboardingSeen, portalOnboardingPending } from './portal';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string, userKind: 'internal' | 'client'): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: userKind === 'internal' ? 'aal2' : 'aal1',
    session_id: randomUUID(),
    amr: [
      {
        method: userKind === 'internal' ? 'totp' : 'otp',
        timestamp: Math.floor(Date.now() / 1000),
      },
    ],
    user_kind: userKind,
  };
}

describe('portal onboarding marker', () => {
  it('is pending until the user dismisses it', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };
      const viewer = { userId: world.users.decisionMakerA, organizationId: world.organizationId };
      const claims = claimsFor(world.users.decisionMakerA, 'client');

      expect(await portalOnboardingPending(claims, viewer, deps)).toBe(true);
      await markPortalOnboardingSeen(claims, viewer, deps);
      await markPortalOnboardingSeen(claims, viewer, deps);

      expect(await portalOnboardingPending(claims, viewer, deps)).toBe(false);
    });
  });

  it('marker is per user', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };
      const decisionMaker = {
        userId: world.users.decisionMakerA,
        organizationId: world.organizationId,
      };
      const operational = {
        userId: world.users.operationalA,
        organizationId: world.organizationId,
      };

      await markPortalOnboardingSeen(
        claimsFor(world.users.decisionMakerA, 'client'),
        decisionMaker,
        deps,
      );

      expect(
        await portalOnboardingPending(
          claimsFor(world.users.operationalA, 'client'),
          operational,
          deps,
        ),
      ).toBe(true);
    });
  });

  it('never shows or records anything for staff', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const deps = { contexts: createDbContexts(testDatabase(sql)) };
      const viewer = { userId: world.users.founder, organizationId: world.organizationId };
      const claims = claimsFor(world.users.founder, 'internal');

      expect(await portalOnboardingPending(claims, viewer, deps)).toBe(false);
      await markPortalOnboardingSeen(claims, viewer, deps);

      await sql`reset role`;
      const rows = await sql`
        select 1 from public.seen_markers
        where user_id = ${world.users.founder} and area = 'portal_onboarding'
      `;
      expect(rows).toHaveLength(0);
    });
  });
});
