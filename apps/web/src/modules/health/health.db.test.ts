import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createBillingFixture,
  createDocumentFixture,
  createFixtureWorld,
  createOutcomeFixture,
  createRoomFixture,
  withTestTransaction,
  type DocumentRecords,
  type World,
} from '@agency-os/db/testing';
import { loadClientHealth } from './health';
import { healthClaims, healthDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

/** Only the approvals a test inserts count: the fixtures' own approvals are withdrawn. */
async function approvals(
  sql: TransactionSql,
  world: World,
  projectId: string,
  subjectId: string,
  entries: { requestedAt: string; decidedAt: string | null }[],
) {
  await sql`update public.approvals set status = 'withdrawn' where client_id = ${world.clients.a}`;
  for (const entry of entries) {
    await sql`
      insert into public.approvals (organization_id, client_id, project_id, subject_type,
                                    subject_id, requested_by, requested_at, status, decided_at)
      values (${world.organizationId}, ${world.clients.a}, ${projectId}, 'phase', ${subjectId},
              ${world.users.founder}, ${entry.requestedAt},
              ${entry.decidedAt ? 'approved' : 'pending'}::app.approval_status, ${entry.decidedAt})
    `;
  }
}

async function comment(
  sql: TransactionSql,
  world: World,
  records: DocumentRecords,
  input: { documentId: string; versionId: string; authorId: string; internal: boolean; at: string },
) {
  await sql`
    insert into public.project_document_comments (document_id, version_id, organization_id,
                                                  client_id, project_id, author_id, body,
                                                  internal, created_at)
    values (${input.documentId}, ${input.versionId}, ${world.organizationId}, ${world.clients.a},
            ${records.projectId}, ${input.authorId}, 'Comentário', ${input.internal}, ${input.at})
  `;
}

/** A visible team question answered in 30 hours, an internal one and an unanswered one. */
async function conversation(sql: TransactionSql, world: World, records: DocumentRecords) {
  const draft = { documentId: records.draftId, versionId: records.draftVersionId };
  const approved = { documentId: records.approvedId, versionId: records.approvedVersionId };
  const team = world.users.founder;
  const client = world.users.decisionMakerA;
  await comment(sql, world, records, {
    ...draft,
    authorId: team,
    internal: false,
    at: '2026-10-10T00:00:00Z',
  });
  await comment(sql, world, records, {
    ...draft,
    authorId: client,
    internal: false,
    at: '2026-10-11T06:00:00Z',
  });
  await comment(sql, world, records, {
    ...approved,
    authorId: team,
    internal: true,
    at: '2026-10-09T00:00:00Z',
  });
  await comment(sql, world, records, {
    ...approved,
    authorId: client,
    internal: false,
    at: '2026-10-09T12:00:00Z',
  });
  await comment(sql, world, records, {
    ...approved,
    authorId: team,
    internal: false,
    at: '2026-10-12T00:00:00Z',
  });
}

describe('client health', () => {
  it(
    'the health of a client combines its four signals',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const billing = await createBillingFixture(sql, world);
        const outcome = await createOutcomeFixture(sql, world);
        const documents = await createDocumentFixture(sql, world);
        await sql`
          update public.payment_requests set due_date = '2026-10-05'
          where id = ${billing.a.sentRequestId}
        `;
        await sql`
          update public.payment_requests set due_date = '2026-10-01', paid_at = '2026-09-29T10:00:00Z'
          where id = ${billing.a.paidRequestId}
        `;
        await approvals(sql, world, outcome.rooms.a.projectId, outcome.rooms.a.phaseIds[1], [
          { requestedAt: '2026-10-01T10:00:00Z', decidedAt: '2026-10-05T10:00:00Z' },
          { requestedAt: '2026-10-05T10:00:00Z', decidedAt: null },
        ]);
        await conversation(sql, world, documents.a);
        const { deps } = healthDeps(sql);

        const health = await loadClientHealth(
          healthClaims(world.users.founder),
          world.clients.a,
          deps,
        );

        expect(health?.signals).toMatchObject({
          payments: { score: 50, detail: { onTime: 1, total: 2 } },
          approvals: { score: 64, detail: { medianDays: 7 } },
          responses: { score: 96, detail: { medianHours: 30 } },
          outcome: { score: 100 },
        });
        expect(health).toMatchObject({ score: 78, level: 'healthy' });
      });
    },
    SLOW,
  );

  it(
    'payments count on the Lisbon payment date',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const billing = await createBillingFixture(sql, world);
        await sql`
          update public.payment_requests set due_date = '2026-07-10', paid_at = '2026-07-10T23:30:00Z'
          where id = ${billing.a.paidRequestId}
        `;
        const { deps } = healthDeps(sql);

        const health = await loadClientHealth(
          healthClaims(world.users.founder),
          world.clients.a,
          deps,
        );

        expect(health?.signals.payments).toEqual({
          score: 0,
          detail: { kind: 'payments', onTime: 0, total: 1 },
        });
      });
    },
    SLOW,
  );

  it(
    'only visible team comments and client replies count',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const documents = await createDocumentFixture(sql, world);
        await conversation(sql, world, documents.a);
        const { deps } = healthDeps(sql);

        const health = await loadClientHealth(
          healthClaims(world.users.founder),
          world.clients.a,
          deps,
        );

        expect(health?.signals.responses).toEqual({
          score: 96,
          detail: { kind: 'responses', medianHours: 30 },
        });
      });
    },
    SLOW,
  );

  it(
    'pending approvals count with their elapsed days',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const rooms = await createRoomFixture(sql, world);
        await approvals(sql, world, rooms.a.projectId, rooms.a.phaseIds[1], [
          { requestedAt: '2026-10-01T10:00:00Z', decidedAt: null },
        ]);
        const { deps } = healthDeps(sql);

        const health = await loadClientHealth(
          healthClaims(world.users.founder),
          world.clients.a,
          deps,
        );

        expect(health?.signals.approvals).toEqual({
          score: 0,
          detail: { kind: 'approvals', medianDays: 14 },
        });
        expect(health?.signals.payments).toBeNull();
      });
    },
    SLOW,
  );

  it(
    'only billing readers of the room see the health',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const { deps } = healthDeps(sql);
        const load = (userId: string, kind: 'internal' | 'client' = 'internal') =>
          loadClientHealth(healthClaims(userId, kind), world.clients.a, deps);

        expect(await load(world.users.founder)).not.toBeNull();
        expect(await load(world.users.finance)).not.toBeNull();
        expect(await load(world.users.manager)).not.toBeNull();
        expect(await load(world.users.freelancer)).toBeNull();
        expect(await load(world.users.decisionMakerA, 'client')).toBeNull();
        expect(
          await loadClientHealth(healthClaims(world.users.founder), world.clients.b, deps),
        ).toMatchObject({ score: null, level: null });
      });
    },
    SLOW,
  );
});
