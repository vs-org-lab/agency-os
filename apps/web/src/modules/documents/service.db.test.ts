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
import { listPortalDocuments } from './portal';
import { saveDocument, shareDocument, withdrawDocument } from './service';

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

describe('documents', () => {
  it('rejects a link that is not a public Figma link', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      const result = await saveDocument(
        claimsFor(world.users.founder),
        { dealId: core.a.dealId, title: 'Apresentação', url: 'https://evil.io/deck/abc' },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });

  it('sharing makes the document visible in the portal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql);
      const saved = await saveDocument(
        claimsFor(world.users.founder),
        {
          dealId: core.a.dealId,
          title: 'Sessão de proposta',
          url: 'https://www.figma.com/deck/AbC123/Sessao',
        },
        deps,
      );
      if (!saved.ok) throw new Error(`save failed: ${saved.rule}`);
      const portal = () =>
        deps.contexts.withUserContext(claimsFor(world.users.decisionMakerA), (tx) =>
          listPortalDocuments(tx, world.clients.a),
        );

      expect(await portal()).toEqual([]);
      expect(
        await shareDocument(claimsFor(world.users.founder), { documentId: saved.documentId }, deps),
      ).toEqual({ ok: true });
      const visible = await portal();

      expect(visible.map((document) => document.title)).toEqual(['Sessão de proposta']);
      expect(visible[0]?.embedUrl).toBe(
        'https://embed.figma.com/deck/AbC123/Sessao?embed-host=agency-os',
      );
      await sql`reset role`;
      const events = await sql<{ id: string }[]>`
        select id from public.domain_events
        where type = 'core.document.shared' and payload ->> 'documentId' = ${saved.documentId}
      `;
      expect(events).toHaveLength(1);
    });
  });

  it('withdrawing hides it again', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);
      const deps = depsFor(sql);
      await shareDocument(claimsFor(world.users.founder), { documentId: core.a.documentId }, deps);

      expect(
        await withdrawDocument(
          claimsFor(world.users.founder),
          { documentId: core.a.documentId },
          deps,
        ),
      ).toEqual({ ok: true });
      const visible = await deps.contexts.withUserContext(
        claimsFor(world.users.decisionMakerA),
        (tx) => listPortalDocuments(tx, world.clients.a),
      );

      expect(visible).toEqual([]);
    });
  });

  it('manager of another client gets not_found', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const core = await createCoreFixture(sql, world);

      expect(
        await shareDocument(
          claimsFor(world.users.manager),
          { documentId: core.b.documentId },
          depsFor(sql),
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });
});
