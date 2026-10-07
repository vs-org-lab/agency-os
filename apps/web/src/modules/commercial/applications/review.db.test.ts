import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { listApplications } from './list';
import { reviewQueueB } from './review';

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

async function queueB(sql: TransactionSql, world: World, path: 'a' | 'b' = 'b') {
  const [contact] = await sql<{ id: string }[]>`
    insert into public.contacts (organization_id, client_id, full_name, email, role)
    values (${world.organizationId}, ${world.clients.a}, 'Ana Costa', ${`ana-${randomUUID()}@empresa.pt`}, 'decision_maker')
    returning id
  `;
  const [deal] = await sql<{ id: string }[]>`
    insert into public.deals (organization_id, client_id, title, pipeline_code, source)
    values (${world.organizationId}, ${world.clients.a}, 'Client A', '0.2', 'application')
    returning id
  `;
  const [form] = await sql<{ id: string }[]>`
    insert into public.application_forms (organization_id, version, definition)
    values (${world.organizationId}, ${Math.floor(Math.random() * 1_000_000) + 2}, '{}'::jsonb) returning id
  `;
  const [application] = await sql<{ id: string }[]>`
    insert into public.applications (organization_id, client_id, contact_id, deal_id, form_id, answers,
                                     score, path, source, consent_at, consent_text_version)
    values (${world.organizationId}, ${world.clients.a}, ${contact?.id ?? ''}, ${deal?.id ?? ''}, ${form?.id ?? ''},
            '{}'::jsonb, 7, ${path}, '{"utm":{"source":"linkedin"}}'::jsonb, now(), '2026-10')
    returning id
  `;
  return { applicationId: application?.id ?? '', dealId: deal?.id ?? '' };
}

async function dealCode(sql: TransactionSql, dealId: string) {
  await sql`reset role`;
  const [row] = await sql<{ code: string }[]>`
    select pipeline_code::text as code from public.deals where id = ${dealId}
  `;
  return row?.code;
}

describe('queue b review', () => {
  it('rejection is not recorded when the deal can no longer move', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { applicationId, dealId } = await queueB(sql, world);
      await sql`update public.deals set pipeline_code = 'X.3' where id = ${dealId}`;
      const contexts = createDbContexts(testDatabase(sql));

      const result = await reviewQueueB(
        claimsFor(world.users.founder),
        { applicationId, decision: 'c' },
        { contexts, flush: async () => {} },
      );

      expect(result).toEqual({ ok: false, rule: 'stage_refused' });
      await sql`reset role`;
      const [application] = await sql<{ decision: string | null }[]>`
        select review_decision::text as decision from public.applications where id = ${applicationId}
      `;
      expect(application?.decision).toBeNull();
      expect(await dealCode(sql, dealId)).toBe('X.3');
    });
  });

  it('approve to a emits the reviewed event and keeps the deal at 0.2', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { applicationId, dealId } = await queueB(sql, world);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await reviewQueueB(
        claimsFor(world.users.founder),
        { applicationId, decision: 'a' },
        { contexts, flush: async () => {} },
      );

      expect(result).toEqual({ ok: true });
      expect(await dealCode(sql, dealId)).toBe('0.2');
      const [event] = await sql<{ decision: string }[]>`
        select payload ->> 'decision' as decision from public.domain_events
        where organization_id = ${world.organizationId} and type = 'commercial.application.reviewed'
      `;
      expect(event?.decision).toBe('a');
    });
  });

  it('send to c closes the deal at X.4', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { applicationId, dealId } = await queueB(sql, world);
      const contexts = createDbContexts(testDatabase(sql));

      await reviewQueueB(
        claimsFor(world.users.founder),
        { applicationId, decision: 'c' },
        { contexts, flush: async () => {} },
      );

      expect(await dealCode(sql, dealId)).toBe('X.4');
    });
  });

  it('a reviewed application cannot be reviewed twice', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { applicationId } = await queueB(sql, world);
      const contexts = createDbContexts(testDatabase(sql));
      const deps = { contexts, flush: async () => {} };

      await reviewQueueB(claimsFor(world.users.founder), { applicationId, decision: 'a' }, deps);
      expect(
        await reviewQueueB(claimsFor(world.users.founder), { applicationId, decision: 'c' }, deps),
      ).toEqual({ ok: false, rule: 'already_reviewed' });
    });
  });

  it('queue b lists only unreviewed path b applications', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const pending = await queueB(sql, world);
      await sql`update public.deals set pipeline_code = 'X.4' where id = ${pending.dealId}`;
      const pathA = await queueB(sql, world, 'a');
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const result = await withUserContext(claimsFor(world.users.founder), async (tx) => ({
        queue: await listApplications(tx, { tab: 'queue_b' }),
        all: await listApplications(tx, { tab: 'all' }),
      }));

      expect(result.queue.map((row) => row.id)).toEqual([pending.applicationId]);
      expect(result.all.map((row) => row.id).sort()).toEqual(
        [pending.applicationId, pathA.applicationId].sort(),
      );
      expect(result.all[0]).toMatchObject({ companyName: 'Client A', utmSource: 'linkedin' });
    });
  });

  it('finance cannot review', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { applicationId } = await queueB(sql, world);
      const contexts = createDbContexts(testDatabase(sql));

      expect(
        await reviewQueueB(
          claimsFor(world.users.finance),
          { applicationId, decision: 'a' },
          { contexts, flush: async () => {} },
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
