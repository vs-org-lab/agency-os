import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { DEFAULT_ORBIT_GRID } from './defaults';
import { getActiveTemplate, publishTemplate } from './service';

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

describe('Core template service', () => {
  it('creates version 1 from the default', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { withSystemContext } = createDbContexts(testDatabase(sql));

      const grid = await withSystemContext((tx) =>
        getActiveTemplate(tx, world.organizationId, 'orbit_grid'),
      );
      const again = await withSystemContext((tx) =>
        getActiveTemplate(tx, world.organizationId, 'orbit_grid'),
      );

      expect(grid.version).toBe(1);
      expect(grid.definition).toEqual(DEFAULT_ORBIT_GRID);
      expect(again.id).toBe(grid.id);
    });
  });

  it('publishing creates a new active version and keeps the old one', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));
      const first = await contexts.withSystemContext((tx) =>
        getActiveTemplate(tx, world.organizationId, 'orbit_grid'),
      );

      const result = await publishTemplate(
        claimsFor(world.users.founder),
        { kind: 'orbit_grid', definition: DEFAULT_ORBIT_GRID },
        { contexts },
      );

      expect(result).toEqual({ ok: true, version: 2 });
      await sql`reset role`;
      const rows = await sql<{ version: number; active: boolean }[]>`
        select version, is_active as active from public.core_templates
        where organization_id = ${world.organizationId} and kind = 'orbit_grid' order by version
      `;
      expect(rows).toEqual([
        { version: 1, active: false },
        { version: 2, active: true },
      ]);
      expect(first.version).toBe(1);
    });
  });

  it('only the founder publishes', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await publishTemplate(
        claimsFor(world.users.manager),
        { kind: 'orbit_grid', definition: DEFAULT_ORBIT_GRID },
        { contexts },
      );

      expect(result).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('rejects an invalid definition', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contexts = createDbContexts(testDatabase(sql));

      const result = await publishTemplate(
        claimsFor(world.users.founder),
        { kind: 'briefing', definition: { blocks: [] } },
        { contexts },
      );

      expect(result).toEqual({ ok: false, rule: 'invalid_input' });
    });
  });
});
