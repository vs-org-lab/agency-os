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
import { searchWorkspace } from './search';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string, kind: 'internal' | 'client' = 'internal'): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: kind,
  };
}

async function insertClient(sql: TransactionSql, world: World, name: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.clients (organization_id, name) values (${world.organizationId}, ${name})
    returning id
  `;
  if (!row) throw new Error('client was not created');
  return row.id;
}

async function setup(sql: TransactionSql) {
  const world = await createFixtureWorld(sql);
  const contexts = createDbContexts(testDatabase(sql));
  return { world, contexts };
}

describe('searchWorkspace', () => {
  it('finds clients, deals and tasks of the organization', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts } = await setup(sql);
      const clientId = await insertClient(sql, world, 'Zebra Studio');
      await sql`
        insert into public.deals (organization_id, client_id, title, source)
        values (${world.organizationId}, ${clientId}, 'Zebra rebrand', 'acquisition')
      `;
      await sql`
        insert into public.tasks (organization_id, client_id, title)
        values (${world.organizationId}, ${clientId}, 'Zebra kickoff')
      `;
      await sql`
        insert into public.tasks (organization_id, title)
        values (${world.organizationId}, 'Zebra internal')
      `;

      const result = await searchWorkspace(claimsFor(world.users.founder), 'zebra', { contexts });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const byKind = (kind: string) => result.results.filter((r) => r.kind === kind);
      expect(byKind('client')).toEqual([
        {
          kind: 'client',
          id: clientId,
          title: 'Zebra Studio',
          context: null,
          href: `/c/${clientId}`,
        },
      ]);
      expect(byKind('deal')).toMatchObject([{ title: 'Zebra rebrand', context: 'Zebra Studio' }]);
      expect(byKind('deal')[0]?.href).toMatch(/^\/pipeline\/[0-9a-f-]{36}$/);
      expect(byKind('task').map((r) => [r.title, r.context, r.href])).toEqual(
        expect.arrayContaining([
          ['Zebra kickoff', 'Zebra Studio', `/c/${clientId}/tasks`],
          ['Zebra internal', null, '/tasks'],
        ]),
      );
    });
  });

  it('excludes archived clients and deals and finished tasks', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts } = await setup(sql);
      const clientId = await insertClient(sql, world, 'Quokka Live');
      const archivedId = await insertClient(sql, world, 'Quokka Old');
      await sql`update public.clients set archived_at = now() where id = ${archivedId}`;
      await sql`
        insert into public.deals (organization_id, client_id, title, source, archived_at)
        values (${world.organizationId}, ${clientId}, 'Quokka gone', 'acquisition', now())
      `;
      await sql`
        insert into public.tasks (organization_id, title, status)
        values (${world.organizationId}, 'Quokka finished', 'done')
      `;

      const result = await searchWorkspace(claimsFor(world.users.founder), 'quokka', { contexts });

      expect(result.ok && result.results.map((r) => r.title)).toEqual(['Quokka Live']);
    });
  });

  it('does not return rows from another organization', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts } = await setup(sql);
      const other = await createFixtureWorld(sql);
      await insertClient(sql, other, 'Narwhal Foreign');
      await insertClient(sql, world, 'Narwhal Own');

      const result = await searchWorkspace(claimsFor(world.users.founder), 'narwhal', {
        contexts,
      });

      expect(result.ok && result.results.map((r) => r.title)).toEqual(['Narwhal Own']);
    });
  });

  it('treats percent, underscore and backslash literally', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts } = await setup(sql);
      await insertClient(sql, world, '50% Off');
      await insertClient(sql, world, '50 Plain');
      await insertClient(sql, world, 'Back\\slash');
      const claims = claimsFor(world.users.founder);

      const percent = await searchWorkspace(claims, '50%', { contexts });
      const underscore = await searchWorkspace(claims, '5_', { contexts });
      const wildcard = await searchWorkspace(claims, '%%', { contexts });
      const backslash = await searchWorkspace(claims, 'back\\s', { contexts });

      expect(percent.ok && percent.results.map((r) => r.title)).toEqual(['50% Off']);
      expect(underscore.ok && underscore.results).toEqual([]);
      expect(wildcard.ok && wildcard.results).toEqual([]);
      expect(backslash.ok && backslash.results.map((r) => r.title)).toEqual(['Back\\slash']);
    });
  });

  it('caps each kind at five results', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts } = await setup(sql);
      for (let index = 0; index < 7; index += 1) {
        await insertClient(sql, world, `Capybara ${index}`);
      }

      const result = await searchWorkspace(claimsFor(world.users.founder), 'capybara', {
        contexts,
      });

      expect(result.ok && result.results).toHaveLength(5);
    });
  });

  it('rejects client users with forbidden', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts } = await setup(sql);

      const result = await searchWorkspace(
        claimsFor(world.users.decisionMakerA, 'client'),
        'client',
        { contexts },
      );

      expect(result).toEqual({ ok: false, rule: 'forbidden' });
    });
  });

  it('rejects sessions below aal2 with forbidden', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts } = await setup(sql);

      const result = await searchWorkspace(
        { ...claimsFor(world.users.founder), aal: 'aal1' },
        'client',
        { contexts },
      );

      expect(result).toEqual({ ok: false, rule: 'forbidden' });
    });
  });

  it('rejects one-character queries', async () => {
    await withTestTransaction(async (sql) => {
      const { world, contexts } = await setup(sql);

      const result = await searchWorkspace(claimsFor(world.users.founder), ' a ', { contexts });

      expect(result).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });
});
