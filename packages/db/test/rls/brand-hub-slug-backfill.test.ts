import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { closeTestSql, withTestTransaction } from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

it('the slug backfill gives every hub a free address', async () => {
  const migration = readFileSync(
    path.resolve(
      import.meta.dirname,
      '../../../../supabase/migrations/20261014111949_brand_hub_access_modes.sql',
    ),
    'utf8',
  );
  const block = migration
    .slice(migration.indexOf('DO $$'), migration.indexOf('END $$;') + 'END $$;'.length)
    .replaceAll('"brand_hubs"', 'probe_hubs')
    .replaceAll('"clients"', 'probe_clients');
  await withTestTransaction(async (sql) => {
    await sql`create temp table probe_clients (id int primary key, name text)`;
    await sql`create temp table probe_hubs (id int primary key, client_id int, created_at int, slug text)`;
    const names = [
      'Acme',
      'Acme',
      'Acme 2',
      'Ótica  São João!',
      'ab',
      '---',
      `${'x'.repeat(53)}-y`,
    ];
    for (const [index, name] of names.entries()) {
      await sql`insert into probe_clients values (${index}, ${name})`;
      await sql`insert into probe_hubs values (${index}, ${index}, ${index}, null)`;
    }
    await sql.unsafe(block);
    const rows = await sql<{ slug: string }[]>`select slug from probe_hubs order by id`;
    const slugs = rows.map((row) => row.slug);
    expect(slugs).toEqual([
      'acme',
      'acme-2',
      'acme-2-2',
      'otica-sao-joao',
      'ab-hub',
      'hub',
      'x'.repeat(53),
    ]);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((slug) => /^[a-z0-9-]{3,60}$/.test(slug))).toBe(true);
  });
});
