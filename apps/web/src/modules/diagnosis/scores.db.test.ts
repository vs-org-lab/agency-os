import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { recordCrossReview } from './cross-review';
import { getCoreWorkspace } from './queries';
import { saveScores } from './scores';

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

function depsFor(sql: TransactionSql) {
  return { contexts: createDbContexts(testDatabase(sql)) };
}

describe('Orbit scores, roadmap and cross review', () => {
  it('rejects points above the criterion maximum', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      const result = await saveScores(
        claimsFor(world.users.founder),
        {
          engagementId: core.a.engagementId,
          scores: [{ front: 'core', criterionId: 'core_1', points: 6, justification: 'Prova' }],
        },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('rejects an unknown criterion', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      const result = await saveScores(
        claimsFor(world.users.founder),
        {
          engagementId: core.a.engagementId,
          scores: [{ front: 'core', criterionId: 'orbit_1', points: 2, justification: 'Prova' }],
        },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('index totals per front', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql);

      const saved = await saveScores(
        claimsFor(world.users.founder),
        {
          engagementId: core.a.engagementId,
          scores: [1, 2, 3, 4, 5].map((index) => ({
            front: 'gravity' as const,
            criterionId: `gravity_${index}`,
            points: index,
            justification: 'Prova',
          })),
        },
        deps,
      );
      const workspace = await deps.contexts.withUserContext(claimsFor(world.users.founder), (tx) =>
        getCoreWorkspace(tx, core.a.dealId),
      );

      expect(saved).toEqual({ ok: true });
      expect(workspace?.index).toEqual([
        { front: 'core', total: 0, max: 25, complete: false },
        { front: 'orbit', total: 3, max: 25, complete: false },
        { front: 'gravity', total: 15, max: 25, complete: true },
        { front: 'constellation', total: 0, max: 25, complete: false },
      ]);
    });
  });

  it('roadmap groups findings by lane', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await sql`
        insert into public.core_findings (organization_id, client_id, engagement_id, front, title,
                                          impact, effort, lane, owner)
        values (${world.organizationId}, ${world.clients.a}, ${core.a.engagementId}, 'gravity',
                'Sem rastreamento', 'high', 'high', 'days_90', 'aurion')
      `;
      const deps = depsFor(sql);

      const workspace = await deps.contexts.withUserContext(claimsFor(world.users.founder), (tx) =>
        getCoreWorkspace(tx, core.a.dealId),
      );

      expect(workspace?.roadmap.days_30.map((finding) => finding.title)).toEqual([
        'Slow mobile site',
      ]);
      expect(workspace?.roadmap.days_90.map((finding) => finding.title)).toEqual([
        'Sem rastreamento',
      ]);
      expect(workspace?.roadmap.months_12).toEqual([]);
      expect(workspace?.internalItems).toBe(1);
      expect(workspace?.readiness.findingsWithoutEvidence).toBe(1);
    });
  });

  it('cross review warns when the reviewer wrote most findings', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await sql`update public.core_findings set author_id = ${world.users.founder} where id = ${core.a.findingId}`;
      const deps = depsFor(sql);

      const byAuthor = await recordCrossReview(
        claimsFor(world.users.founder),
        { engagementId: core.a.engagementId, notes: 'Revisto' },
        deps,
      );
      const byOther = await recordCrossReview(
        claimsFor(world.users.manager),
        { engagementId: core.a.engagementId, notes: 'Revisto por outra pessoa' },
        deps,
      );

      expect(byAuthor).toEqual({ ok: true, sameAuthorWarning: true });
      expect(byOther).toEqual({ ok: true, sameAuthorWarning: false });
      await sql`reset role`;
      const [row] = await sql<{ reviewer: string; notes: string }[]>`
        select cross_review_by as reviewer, cross_review_notes as notes
        from public.core_engagements where id = ${core.a.engagementId}
      `;
      expect(row).toEqual({ reviewer: world.users.manager, notes: 'Revisto por outra pessoa' });
    });
  });
});
