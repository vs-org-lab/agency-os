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
import {
  applyBriefingDraft,
  saveBriefingNote,
  saveEngagementDetails,
  shareBriefing,
} from './briefing';

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
  return { contexts: createDbContexts(testDatabase(sql)), flush: async () => {} };
}

async function notes(sql: TransactionSql, engagementId: string) {
  await sql`reset role`;
  return sql<{ block: string; question: string; body: string }[]>`
    select block_id as block, question_id as question, body from public.core_briefing_notes
    where engagement_id = ${engagementId} order by block_id, question_id
  `;
}

describe('briefing', () => {
  it('saving one note leaves the other notes untouched', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql);
      const founder = claimsFor(world.users.founder);
      const manager = claimsFor(world.users.manager);

      await saveBriefingNote(
        founder,
        {
          engagementId: core.a.engagementId,
          blockId: 'block_2',
          questionId: 'block_2_q1',
          body: 'Ambição',
        },
        deps,
      );
      const saved = await saveBriefingNote(
        manager,
        {
          engagementId: core.a.engagementId,
          blockId: 'block_2',
          questionId: null,
          body: 'Notas livres',
        },
        deps,
      );
      await saveBriefingNote(
        founder,
        {
          engagementId: core.a.engagementId,
          blockId: 'block_2',
          questionId: 'block_2_q1',
          body: 'Ambição revista',
        },
        deps,
      );

      expect(saved).toMatchObject({ ok: true });
      expect(await notes(sql, core.a.engagementId)).toEqual([
        { block: 'block_1', question: '', body: 'Notes' },
        { block: 'block_2', question: '', body: 'Notas livres' },
        { block: 'block_2', question: 'block_2_q1', body: 'Ambição revista' },
      ]);
    });
  });

  it('rejects a question that is not in the guide version', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      const result = await saveBriefingNote(
        claimsFor(world.users.founder),
        {
          engagementId: core.a.engagementId,
          blockId: 'block_2',
          questionId: 'block_1_q1',
          body: 'x',
        },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('sharing an empty briefing is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      await sql`update public.core_briefing_notes set body = '   ' where engagement_id = ${core.a.engagementId}`;

      const result = await shareBriefing(
        claimsFor(world.users.founder),
        { engagementId: core.a.engagementId },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: false, rule: 'briefing_empty' });
    });
  });

  it('sharing emits the event once and sets the date', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql);

      expect(
        await shareBriefing(
          claimsFor(world.users.founder),
          { engagementId: core.a.engagementId },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(
        await shareBriefing(
          claimsFor(world.users.founder),
          { engagementId: core.a.engagementId },
          deps,
        ),
      ).toEqual({ ok: true });

      await sql`reset role`;
      const [engagement] = await sql<{ shared: boolean }[]>`
        select briefing_shared_at is not null as shared from public.core_engagements
        where id = ${core.a.engagementId}
      `;
      const events = await sql<{ id: string }[]>`
        select id from public.domain_events
        where type = 'core.briefing.shared' and payload ->> 'engagementId' = ${core.a.engagementId}
      `;
      expect(engagement?.shared).toBe(true);
      expect(events).toHaveLength(1);
    });
  });

  it('manager of another client gets not_found', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      const result = await saveBriefingNote(
        claimsFor(world.users.manager),
        { engagementId: core.b.engagementId, blockId: 'block_1', questionId: null, body: 'x' },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('saves the buyer test link only when it is https', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql);
      const founder = claimsFor(world.users.founder);

      expect(
        await saveEngagementDetails(
          founder,
          { engagementId: core.a.engagementId, buyerTestUrl: 'http://loom.com/share/abc' },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_input' });
      expect(
        await saveEngagementDetails(
          founder,
          {
            engagementId: core.a.engagementId,
            buyerTestUrl: 'https://www.loom.com/share/abc',
            narrative: 'Onde estão, o que custa, o que proponho, decisão.',
          },
          deps,
        ),
      ).toEqual({ ok: true });

      await sql`reset role`;
      const [row] = await sql<{ url: string; narrative: string }[]>`
        select buyer_test_url as url, narrative from public.core_engagements where id = ${core.a.engagementId}
      `;
      expect(row).toEqual({
        url: 'https://www.loom.com/share/abc',
        narrative: 'Onde estão, o que custa, o que proponho, decisão.',
      });
    });
  });

  it('pasted draft never overwrites notes without confirmation', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql);
      const founder = claimsFor(world.users.founder);
      const draft = [
        '## block_1',
        'Resumo novo do bloco 1.',
        '## block_2',
        'Resumo do bloco 2.',
      ].join('\n');

      const first = await applyBriefingDraft(
        founder,
        { engagementId: core.a.engagementId, text: draft, overwrite: false },
        deps,
      );
      expect(first).toEqual({ ok: false, rule: 'confirm_overwrite', blockIds: ['block_1'] });
      expect((await notes(sql, core.a.engagementId)).map((note) => note.body)).toEqual(['Notes']);

      const confirmed = await applyBriefingDraft(
        founder,
        { engagementId: core.a.engagementId, text: draft, overwrite: true },
        deps,
      );
      expect(confirmed).toEqual({ ok: true, blockIds: ['block_1', 'block_2'] });
      expect(await notes(sql, core.a.engagementId)).toEqual([
        { block: 'block_1', question: '', body: 'Resumo novo do bloco 1.' },
        { block: 'block_2', question: '', body: 'Resumo do bloco 2.' },
      ]);
    });
  });
});
