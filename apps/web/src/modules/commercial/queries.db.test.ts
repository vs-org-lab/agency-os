import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCommercialFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { listPipelineDeals } from './queries';

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

describe('listPipelineDeals', () => {
  it('lists only deals visible to the actor', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const forManager = await withUserContext(claimsFor(world.users.manager), (tx) =>
        listPipelineDeals(tx, {}),
      );
      const forFounder = await withUserContext(claimsFor(world.users.founder), (tx) =>
        listPipelineDeals(tx, {}),
      );

      expect(forManager.map((card) => card.dealId)).toEqual([fixture.a.dealId]);
      expect(forFounder.map((card) => card.dealId).sort()).toEqual(
        [fixture.a.dealId, fixture.b.dealId].sort(),
      );
      expect(forFounder.find((card) => card.dealId === fixture.a.dealId)).toMatchObject({
        clientName: 'Client A',
        code: '0.3',
        currency: 'EUR',
      });
    });
  });

  it('flags overdue next steps', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      await sql`
        update public.deals set next_step = 'Enviar proposta', next_step_due_on = current_date - 1,
          next_step_owner_kind = 'staff', next_step_owner_user_id = ${world.users.founder}
        where id = ${fixture.a.dealId}
      `;
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const cards = await withUserContext(claimsFor(world.users.founder), (tx) =>
        listPipelineDeals(tx, {}),
      );

      expect(cards.find((card) => card.dealId === fixture.a.dealId)).toMatchObject({
        nextStep: 'Enviar proposta',
        overdue: true,
        ownerLabel: 'Founder',
      });
      expect(cards.find((card) => card.dealId === fixture.b.dealId)?.overdue).toBe(false);
    });
  });

  it('filters by stage, owner and search', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      await sql`update public.deals set pipeline_code = 'X.2' where id = ${fixture.b.dealId}`;
      await sql`
        update public.deals set next_step_owner_kind = 'staff', next_step_owner_user_id = ${world.users.founder}
        where id = ${fixture.a.dealId}
      `;
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const result = await withUserContext(claimsFor(world.users.founder), async (tx) => ({
        offCycle: await listPipelineDeals(tx, { stage: 'off_cycle' }),
        owned: await listPipelineDeals(tx, { ownerUserId: world.users.founder }),
        search: await listPipelineDeals(tx, { search: 'client b' }),
      }));

      expect(result.offCycle.map((card) => card.dealId)).toEqual([fixture.b.dealId]);
      expect(result.owned.map((card) => card.dealId)).toEqual([fixture.a.dealId]);
      expect(result.search.map((card) => card.dealId)).toEqual([fixture.b.dealId]);
    });
  });
});
