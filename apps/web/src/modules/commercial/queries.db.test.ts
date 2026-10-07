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
import { DEFAULT_APPLICATION_FORM } from './applications/default-form';
import { getDealDetail } from './deal-detail';
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

  it('deal detail includes per-question points and the cost of inaction answer', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      await sql`
        update public.application_forms set definition = ${JSON.stringify(DEFAULT_APPLICATION_FORM)}::jsonb
        where id = ${fixture.formId}
      `;
      await sql`
        update public.applications set answers = ${JSON.stringify({
          contact: { fullName: 'Ana Costa', email: 'ana@empresa.pt' },
          company: { name: 'Client A', website: null },
          choices: {
            role: 'director',
            sector: 'energy',
            revenue: '5m_20m',
            priority: 'brand_and_site',
            investment: '25k_50k',
            timing: 'six_months',
          },
          texts: { cost_of_inaction: 'Perdemos dois contratos por ano.' },
        })}::jsonb, score = 9, path = 'a'
        where id = ${fixture.a.applicationId}
      `;
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const detail = await withUserContext(claimsFor(world.users.founder), (tx) =>
        getDealDetail(tx, fixture.a.dealId, 'pt-PT'),
      );

      expect(detail?.client.name).toBe('Client A');
      expect(detail?.calls).toHaveLength(1);
      expect(detail?.followUps).toHaveLength(1);
      const application = detail?.applications[0];
      expect(application?.costOfInaction).toBe('Perdemos dois contratos por ano.');
      expect(application?.answers.find((answer) => answer.questionId === 'role')).toEqual({
        questionId: 'role',
        label: 'Qual é a sua função?',
        answer: 'Diretor',
        points: 2,
        knockout: false,
      });
    });
  });

  it('returns null for a deal outside the actor scope', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createCommercialFixture(sql, world);
      const { withUserContext } = createDbContexts(testDatabase(sql));

      const detail = await withUserContext(claimsFor(world.users.manager), (tx) =>
        getDealDetail(tx, fixture.b.dealId, 'pt-PT'),
      );

      expect(detail).toBeNull();
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
