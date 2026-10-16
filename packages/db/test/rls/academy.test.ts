import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asUser,
  closeTestSql,
  createFixtureWorld,
  createRoomFixture,
  withTestTransaction,
  type World,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function item(
  sql: TransactionSql,
  world: World,
  input: {
    clientId: string;
    kind: string;
    status?: string;
    url?: string | null;
    title?: string;
  },
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.academy_items (organization_id, client_id, kind, status, title, position,
                                      url, published_at)
    values (${world.organizationId}, ${input.clientId}, ${input.kind}::app.academy_item_kind,
            ${input.status ?? 'draft'}::app.academy_item_status, ${input.title ?? 'Item'}, 1,
            ${input.url ?? null},
            case when ${input.status ?? 'draft'} = 'published' then now() end)
    returning id
  `;
  if (!row) throw new Error('Academy item was not created');
  return row.id;
}

async function ids(sql: TransactionSql, table: string): Promise<string[]> {
  const rows = await sql<{ client_id: string }[]>`
    select client_id::text from ${sql(table)}
  `;
  return rows.map((row) => row.client_id).sort();
}

describe('academy', () => {
  it(
    'room readers read the academy, other rooms and clients nothing',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        await item(sql, world, { clientId: world.clients.a, kind: 'checklist' });
        await item(sql, world, { clientId: world.clients.b, kind: 'checklist' });
        await sql`
          insert into public.training_sessions (organization_id, client_id, held_on, title)
          values (${world.organizationId}, ${world.clients.a}, '2026-10-01', 'Formação')
        `;

        await asUser(sql, world.users.founder);
        expect(await ids(sql, 'academy_items')).toEqual([world.clients.a, world.clients.b].sort());
        await asUser(sql, world.users.manager);
        expect(await ids(sql, 'academy_items')).toEqual([world.clients.a]);
        expect(await ids(sql, 'training_sessions')).toEqual([world.clients.a]);
        await asUser(sql, world.users.decisionMakerA);
        expect(await ids(sql, 'academy_items')).toEqual([]);
        expect(await ids(sql, 'training_sessions')).toEqual([]);
      });
    },
    SLOW,
  );

  it(
    'clients read only published items through the portal views',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await createRoomFixture(sql, world);
        const published = await item(sql, world, {
          clientId: world.clients.a,
          kind: 'checklist',
          status: 'published',
        });
        const draft = await item(sql, world, { clientId: world.clients.a, kind: 'checklist' });
        await item(sql, world, {
          clientId: world.clients.b,
          kind: 'checklist',
          status: 'published',
        });
        for (const itemId of [published, draft]) {
          await sql`
            insert into public.academy_checklist_steps (organization_id, client_id, item_id,
                                                        position, text)
            values (${world.organizationId}, ${world.clients.a}, ${itemId}, 1, 'Entrar no CMS')
          `;
        }
        const [session] = await sql<{ id: string }[]>`
          insert into public.training_sessions (organization_id, client_id, held_on, title)
          values (${world.organizationId}, ${world.clients.a}, '2026-10-01', 'Formação')
          returning id
        `;
        for (const itemId of [published, draft]) {
          await sql`
            insert into public.training_session_materials (organization_id, session_id, client_id,
                                                           item_id)
            values (${world.organizationId}, ${session?.id ?? ''}, ${world.clients.a}, ${itemId})
          `;
        }

        await asUser(sql, world.users.decisionMakerA);
        const items = await sql<{ id: string }[]>`select id from public.portal_academy_items`;
        const steps = await sql<{ item_id: string }[]>`
          select item_id from public.portal_academy_steps
        `;
        const materials = await sql<{ item_id: string }[]>`
          select item_id from public.portal_training_materials
        `;
        const sessions = await sql`select id from public.portal_training_sessions`;
        expect(items.map((row) => row.id)).toEqual([published]);
        expect(steps.map((row) => row.item_id)).toEqual([published]);
        expect(materials.map((row) => row.item_id)).toEqual([published]);
        expect(sessions).toHaveLength(1);

        await asUser(sql, world.users.clientFinanceB);
        expect(await sql`select id from public.portal_academy_items`).toHaveLength(0);
      });
    },
    SLOW,
  );

  it(
    'content follows the item kind and links are https',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const attempt = (input: { kind: string; url?: string | null; title?: string }) =>
          sql.savepoint((tx) =>
            item(tx as TransactionSql, world, { clientId: world.clients.a, ...input }),
          );

        await item(sql, world, {
          clientId: world.clients.a,
          kind: 'tutorial',
          url: 'https://youtu.be/abc',
        });
        await expect(attempt({ kind: 'tutorial', url: 'http://youtu.be/abc' })).rejects.toThrow(
          /academy_items_url_https/,
        );
        await expect(attempt({ kind: 'checklist', url: 'https://youtu.be/abc' })).rejects.toThrow(
          /academy_items_content/,
        );
        await expect(attempt({ kind: 'manual', title: '' })).rejects.toThrow(
          /academy_items_title_length/,
        );
        await expect(
          sql.savepoint(
            (tx) => tx`
              insert into public.academy_items (organization_id, client_id, kind, status, title,
                                                position)
              values (${world.organizationId}, ${world.clients.a}, 'checklist', 'published', 'X', 2)
            `,
          ),
        ).rejects.toThrow(/academy_items_published_at/);
      });
    },
    SLOW,
  );

  it(
    'authenticated users cannot write the academy',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        await asUser(sql, world.users.founder);

        await expect(
          sql.savepoint((tx) =>
            item(tx as TransactionSql, world, { clientId: world.clients.a, kind: 'checklist' }),
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(
          sql.savepoint(
            (tx) => tx`
              insert into public.training_sessions (organization_id, client_id, held_on, title)
              values (${world.organizationId}, ${world.clients.a}, '2026-10-01', 'Formação')
            `,
          ),
        ).rejects.toThrow(/permission denied/);
      });
    },
    SLOW,
  );
});
