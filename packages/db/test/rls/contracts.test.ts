import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  asSystem,
  asUser,
  closeTestSql,
  createContractFixture,
  createFixtureWorld,
  withTestTransaction,
} from '../../src/testing';

afterAll(async () => {
  await closeTestSql();
});

async function visibleIds(sql: TransactionSql, relation: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from ${sql('public.' + relation)}`.catch(
    (error: Error) => {
      if (/permission denied/.test(error.message)) return [];
      throw error;
    },
  );
  return rows.map((row) => row.id).sort();
}

async function insertEntity(sql: TransactionSql, organizationId: string): Promise<number> {
  const result = await sql`
    insert into public.legal_entities (organization_id, legal_name, tax_id, address, country, email,
                                       representative_name, representative_role)
    values (${organizationId}, 'Outra Lda', '500000000', 'Rua A, Lisboa', 'PT', 'geral@outra.pt',
            'Ana Silva', 'Gerente')
  `.catch((error: Error) => {
    if (/permission denied|row-level security/.test(error.message)) return { count: 0 };
    throw error;
  });
  return result.count;
}

describe('contracts access', () => {
  it('founder manages entities and templates', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contracts = await createContractFixture(sql, world);
      await asUser(sql, world.users.founder);

      expect(await visibleIds(sql, 'legal_entities')).toEqual([contracts.entityId]);
      expect(await visibleIds(sql, 'contract_templates')).toEqual([contracts.templateId]);
      expect(await insertEntity(sql, world.organizationId)).toBe(1);
    });
  });

  it('manager reads but does not edit entities and templates', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contracts = await createContractFixture(sql, world);
      await asUser(sql, world.users.manager);

      expect(await visibleIds(sql, 'contract_templates')).toEqual([contracts.templateId]);
      expect(await insertEntity(sql, world.organizationId)).toBe(0);
    });
  });

  it('manager reads proposals and contracts of assigned clients only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contracts = await createContractFixture(sql, world);
      await asUser(sql, world.users.manager);

      expect(await visibleIds(sql, 'proposals')).toEqual(
        [contracts.a.proposalId, contracts.a.draftProposalId].sort(),
      );
      expect(await visibleIds(sql, 'contracts')).toEqual([contracts.a.contractId]);
      expect(await visibleIds(sql, 'proposal_requests')).toEqual([contracts.a.requestId]);
    });
  });

  it('decision maker reads only sent proposals and contracts of the own client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contracts = await createContractFixture(sql, world);
      await asUser(sql, world.users.decisionMakerA);

      expect(await visibleIds(sql, 'portal_proposals')).toEqual([contracts.a.proposalId]);
      expect(await visibleIds(sql, 'portal_proposal_options')).toEqual([contracts.a.optionId]);
      expect(await visibleIds(sql, 'portal_contracts')).toEqual([contracts.a.contractId]);
      await asSystem(sql);
    });
  });

  it('client users never read drafts, change requests or the base tables', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createContractFixture(sql, world);

      for (const user of [world.users.decisionMakerA, world.users.operationalA]) {
        await asUser(sql, user);
        for (const table of [
          'proposals',
          'proposal_options',
          'proposal_requests',
          'contracts',
          'contract_signatures',
          'legal_entities',
          'contract_templates',
        ]) {
          expect(await visibleIds(sql, table), `${table}`).toEqual([]);
        }
        await asSystem(sql);
      }
    });
  });

  it('operational users do not see proposals in the portal', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createContractFixture(sql, world);
      await asUser(sql, world.users.operationalA);

      expect(await visibleIds(sql, 'portal_proposals')).toEqual([]);
      expect(await visibleIds(sql, 'portal_contracts')).toEqual([]);
    });
  });

  it('client finance and staff see nothing in the portal views', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      await createContractFixture(sql, world);

      for (const user of [world.users.clientFinanceB, world.users.founder, world.users.finance]) {
        await asUser(sql, user);
        for (const view of ['portal_proposals', 'portal_proposal_options', 'portal_contracts']) {
          expect(await visibleIds(sql, view), view).toEqual([]);
        }
        await asSystem(sql);
      }
    });
  });

  it('pipeline writers cannot change a proposal status directly', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createContractFixture(sql, world);

      for (const user of [world.users.manager, world.users.founder]) {
        await asUser(sql, user);
        await expect(
          sql.savepoint(
            (tx) => tx`
              update public.proposals set status = 'sent', sent_at = now()
              where id = ${fixture.a.draftProposalId}
            `,
          ),
        ).rejects.toThrow(/permission denied/);
        await sql.savepoint(
          (tx) => tx`
            update public.proposals set valid_until = valid_until
            where id = ${fixture.a.draftProposalId}
          `,
        );
      }
    });
  });

  it('pipeline writers cannot insert a proposal past draft', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createContractFixture(sql, world);
      await asUser(sql, world.users.manager);

      await expect(
        sql.savepoint(
          (tx) => tx`
            insert into public.proposals (organization_id, client_id, deal_id, legal_entity_id,
                                          currency, locale, valid_until, status, sent_at)
            values (${world.organizationId}, ${world.clients.a}, ${fixture.a.dealId},
                    ${fixture.entityId}, 'EUR', 'pt-PT', current_date + 30, 'sent', now())
          `,
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('pipeline writers cannot edit a sent proposal or its options', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const fixture = await createContractFixture(sql, world);
      const [spare] = await sql<{ id: string }[]>`
        insert into public.proposal_options (organization_id, client_id, proposal_id, position,
                                             name, summary, scope, one_off_amount, payment_plan)
        select organization_id, client_id, proposal_id, 3, 'Reserva', summary, scope, 1,
               payment_plan
        from public.proposal_options where id = ${fixture.a.optionId}
        returning id
      `;
      await asUser(sql, world.users.manager);

      const proposal = await sql`
        update public.proposals set valid_until = current_date + 90
        where id = ${fixture.a.proposalId}
      `;
      const option = await sql`
        update public.proposal_options set one_off_amount = 1 where id = ${fixture.a.optionId}
      `;
      const removed = await sql`
        delete from public.proposal_options where id = ${spare?.id ?? ''}
      `;
      await expect(
        sql.savepoint(
          (tx) => tx`
            insert into public.proposal_options (organization_id, client_id, proposal_id, position,
                                                 name, summary, scope, one_off_amount, payment_plan)
            select organization_id, client_id, proposal_id, 2, 'Extra', summary, scope, 1,
                   payment_plan
            from public.proposal_options where id = ${fixture.a.optionId}
          `,
        ),
      ).rejects.toThrow(/row-level security/);
      const draft = await sql`
        update public.proposals set valid_until = current_date + 90
        where id = ${fixture.a.draftProposalId}
      `;

      expect([proposal.count, option.count, removed.count, draft.count]).toEqual([0, 0, 0, 1]);
    });
  });
});
