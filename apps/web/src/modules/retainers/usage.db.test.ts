import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createFixtureWorld,
  createRetainerFixture,
  withTestTransaction,
} from '@agency-os/db/testing';
import { deleteUsage, recordUsage } from './usage';
import { retainerClaims, retainerDeps } from './testing';

afterAll(async () => {
  await closeTestSql();
});

const SLOW = 120_000;

async function usedPieces(sql: TransactionSql, retainerId: string): Promise<string> {
  await sql`reset role`;
  const [row] = await sql<{ used: string }[]>`
    select coalesce(sum(quantity), 0)::text as used from public.retainer_usage
    where retainer_id = ${retainerId} and kind = 'content_pieces' and extra_request_id is null
  `;
  return row?.used ?? '0';
}

async function auditActions(sql: TransactionSql, resourceId: string): Promise<string[]> {
  await sql`reset role`;
  const rows = await sql<{ action: string }[]>`
    select action from public.audit_log where resource_id = ${resourceId}
  `;
  return rows.map((row) => row.action).sort();
}

describe('retainer usage', () => {
  it(
    'usage above the available is refused',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const manager = retainerClaims(world.users.manager);
        const entry = {
          retainerId: retainer.retainerId,
          kind: 'content_pieces',
          description: 'Carrossel de outubro',
        };

        expect(await recordUsage(manager, { ...entry, quantity: '3' }, deps)).toEqual({
          ok: false,
          rule: 'limit_reached',
        });
        expect(await recordUsage(manager, { ...entry, quantity: '2.8' }, deps)).toEqual({
          ok: true,
        });
        expect(await usedPieces(sql, retainer.retainerId)).toBe('4.8');
        expect(await recordUsage(manager, { ...entry, quantity: '0.1' }, deps)).toEqual({
          ok: false,
          rule: 'limit_reached',
        });
        expect(
          await recordUsage(manager, { ...entry, kind: 'campaigns', quantity: '1' }, deps),
        ).toEqual({ ok: false, rule: 'invalid_input' });
        expect(
          await recordUsage(
            retainerClaims(world.users.freelancer),
            { ...entry, quantity: '1' },
            deps,
          ),
        ).toEqual({ ok: false, rule: 'not_found' });
      });
    },
    SLOW,
  );

  it(
    'usage is audited and can be deleted',
    async () => {
      await withTestTransaction(async (sql) => {
        const world = await createFixtureWorld(sql);
        const retainer = await createRetainerFixture(sql, world);
        const { deps } = retainerDeps(sql);
        const founder = retainerClaims(world.users.founder);

        expect(
          await recordUsage(
            founder,
            {
              retainerId: retainer.retainerId,
              kind: 'maintenance_hours',
              quantity: '1.5',
              description: 'Atualização do site',
            },
            deps,
          ),
        ).toEqual({ ok: true });
        expect(await deleteUsage(founder, retainer.usageId, deps)).toEqual({ ok: true });
        expect(await usedPieces(sql, retainer.retainerId)).toBe('0');
        expect(await auditActions(sql, retainer.usageId)).toEqual(['retainer.usage_deleted']);
        expect(
          await deleteUsage(retainerClaims(world.users.freelancer), retainer.usageId, deps),
        ).toEqual({
          ok: false,
          rule: 'not_found',
        });
      });
    },
    SLOW,
  );
});
