import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCommercialFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { ensureEngagement } from './engagement';
import { DEFAULT_ORBIT_GRID } from './templates/defaults';
import { publishTemplate } from './templates/service';

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

describe('Core engagement', () => {
  it('creates the Core once per deal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const { withSystemContext } = createDbContexts(testDatabase(sql));

      const first = await withSystemContext((tx) =>
        ensureEngagement(tx, { dealId: fixture.a.dealId }),
      );
      const second = await withSystemContext((tx) =>
        ensureEngagement(tx, { dealId: fixture.a.dealId }),
      );

      expect(first.created).toBe(true);
      expect(second).toEqual({ engagementId: first.engagementId, created: false });
      await sql`reset role`;
      const audits = await sql<{ count: number }[]>`
        select count(*)::int as count from public.audit_log
        where action = 'core.created' and resource_id = ${first.engagementId}
      `;
      expect(audits[0]?.count).toBe(1);
    });
  });

  it('keeps the template versions active at creation', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const contexts = createDbContexts(testDatabase(sql));
      const { engagementId } = await contexts.withSystemContext((tx) =>
        ensureEngagement(tx, { dealId: fixture.a.dealId }),
      );

      await publishTemplate(
        claimsFor(world.users.founder),
        { kind: 'orbit_grid', definition: DEFAULT_ORBIT_GRID },
        { contexts },
      );

      await sql`reset role`;
      const [row] = await sql<{ version: number }[]>`
        select t.version from public.core_engagements e
        join public.core_templates t on t.id = e.grid_template_id
        where e.id = ${engagementId}
      `;
      expect(row?.version).toBe(1);
    });
  });
});
