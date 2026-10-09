import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { acceptProposal, getPortalProposal, requestProposalChanges } from './acceptance';
import { contractHash } from './domain/signature';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string, userKind: 'internal' | 'client' = 'client'): VerifiedClaims {
  return {
    sub: userId,
    role: 'authenticated',
    aal: 'aal2',
    session_id: randomUUID(),
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    user_kind: userKind,
  };
}

function depsFor(sql: TransactionSql) {
  return { contexts: createDbContexts(testDatabase(sql)), flush: async () => {} };
}

type Setup = { proposalId: string; optionIds: string[]; dealId: string };

async function sentProposal(
  sql: TransactionSql,
  world: World,
  validUntil = '2099-12-31',
): Promise<Setup> {
  const core = await createCoreFixture(sql, world);
  await sql`
    update public.contacts set portal_user_id = ${world.users.decisionMakerA}
    where id = ${core.a.contactId}
  `;
  const [entity] = await sql<{ id: string }[]>`
    insert into public.legal_entities (organization_id, legal_name, tax_id, address, country, email,
                                       representative_name, representative_role, is_default)
    values (${world.organizationId}, 'Aurion Creative Lda', '516000000', 'Lisboa', 'PT',
            'geral@aurion.test', 'Vladimir Silva', 'Gerente', true)
    returning id
  `;
  if (!entity) throw new Error('Entity was not created');
  await sql`
    insert into public.contract_templates (organization_id, locale, version, body, is_active)
    values (${world.organizationId}, 'pt-PT', 1,
            'Contrato entre {{entidade.denominacao}} e {{cliente.denominacao}} para {{opcao.nome}}: {{opcao.valor}}',
            true)
  `;
  const [proposal] = await sql<{ id: string }[]>`
    insert into public.proposals (organization_id, client_id, deal_id, legal_entity_id, currency,
                                  locale, valid_until, guarantee, status, sent_at)
    values (${world.organizationId}, ${world.clients.a}, ${core.a.dealId}, ${entity.id}, 'EUR',
            'pt-PT', ${validUntil}, 'Garantia', 'sent', now())
    returning id
  `;
  if (!proposal) throw new Error('Proposal was not created');
  const plan = JSON.stringify([{ label: 'Assinatura', percent: 100 }]);
  const options = await sql<{ id: string }[]>`
    insert into public.proposal_options (organization_id, client_id, proposal_id, position, name,
                                         summary, scope, one_off_amount, payment_plan)
    values
      (${world.organizationId}, ${world.clients.a}, ${proposal.id}, 1, 'Orbit essencial', '',
       '[{"text":"Site","findingId":null}]'::jsonb, 6000, ${plan}::jsonb),
      (${world.organizationId}, ${world.clients.a}, ${proposal.id}, 2, 'Orbit com Gravity', '',
       '[{"text":"Site e ativação","findingId":null}]'::jsonb, 12000, ${plan}::jsonb)
    returning id
  `;
  return {
    proposalId: proposal.id,
    optionIds: options.map((row) => row.id),
    dealId: core.a.dealId,
  };
}

const COMPANY = { legalName: 'Empresa Cliente SA', taxId: '500100200', address: 'Porto' };
const SIGNER = { name: 'Ana Costa', role: 'Administradora' };

describe('proposal acceptance', () => {
  it('shows the sent proposal with its options to the decision maker', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const setup = await sentProposal(sql, world);
      const deps = depsFor(sql);

      const proposal = await deps.contexts.withUserContext(
        claimsFor(world.users.decisionMakerA),
        (tx) => getPortalProposal(tx, world.clients.a),
      );

      expect(proposal?.id).toBe(setup.proposalId);
      expect(proposal?.options.map((option) => option.name)).toEqual([
        'Orbit essencial',
        'Orbit com Gravity',
      ]);
      expect(proposal?.options[0]?.scope).toEqual([{ text: 'Site', findingId: null }]);
    });
  });

  it('only the decision maker accepts', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const setup = await sentProposal(sql, world);
      const input = {
        proposalId: setup.proposalId,
        optionId: setup.optionIds[0] ?? '',
        company: COMPANY,
        signer: SIGNER,
      };

      expect(
        await acceptProposal(claimsFor(world.users.operationalA), input, depsFor(sql)),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await acceptProposal(claimsFor(world.users.founder, 'internal'), input, depsFor(sql)),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('an expired proposal cannot be accepted', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const setup = await sentProposal(sql, world, '2020-01-01');

      expect(
        await acceptProposal(
          claimsFor(world.users.decisionMakerA),
          {
            proposalId: setup.proposalId,
            optionId: setup.optionIds[0] ?? '',
            company: COMPANY,
            signer: SIGNER,
          },
          depsFor(sql),
        ),
      ).toEqual({ ok: false, rule: 'expired' });
    });
  });

  it('accepting generates the contract of the chosen option', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const setup = await sentProposal(sql, world);
      const chosen = setup.optionIds[1] ?? '';

      const result = await acceptProposal(
        claimsFor(world.users.decisionMakerA),
        { proposalId: setup.proposalId, optionId: chosen, company: COMPANY, signer: SIGNER },
        depsFor(sql),
      );

      if (!result.ok) throw new Error(`Acceptance failed: ${result.rule}`);
      await sql`reset role`;
      const [contract] = await sql<
        { body: string; body_hash: string; option_id: string; status: string }[]
      >`
        select body, body_hash, option_id, status::text from public.contracts
        where id = ${result.contractId}
      `;
      expect(contract?.body.replace(/[\u00a0\u202f]/g, ' ')).toBe(
        'Contrato entre Aurion Creative Lda e Empresa Cliente SA para Orbit com Gravity: 12 000,00 €',
      );
      expect(contract?.body_hash).toBe(contractHash(contract?.body ?? ''));
      expect(contract).toMatchObject({ option_id: chosen, status: 'awaiting_signatures' });
      const [proposal] = await sql<
        { status: string; accepted_option_id: string; details: unknown }[]
      >`
        select status::text, accepted_option_id, client_details as details
        from public.proposals where id = ${setup.proposalId}
      `;
      expect(proposal).toMatchObject({ status: 'accepted', accepted_option_id: chosen });
      expect(proposal?.details).toMatchObject({
        legalName: 'Empresa Cliente SA',
        signerName: 'Ana Costa',
      });
      const events = await sql`
        select id from public.domain_events
        where type = 'contracts.proposal.accepted' and payload ->> 'proposalId' = ${setup.proposalId}
      `;
      expect(events).toHaveLength(1);
    });
  });

  it('accepting twice creates one contract', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const setup = await sentProposal(sql, world);
      const input = {
        proposalId: setup.proposalId,
        optionId: setup.optionIds[0] ?? '',
        company: COMPANY,
        signer: SIGNER,
      };
      const claims = claimsFor(world.users.decisionMakerA);

      const first = await acceptProposal(claims, input, depsFor(sql));
      const second = await acceptProposal(claims, input, depsFor(sql));

      expect(second).toEqual(first);
      await sql`reset role`;
      const contracts = await sql`
        select id from public.contracts where proposal_id = ${setup.proposalId}
      `;
      expect(contracts).toHaveLength(1);
    });
  });

  it('change requests reach the founder', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const setup = await sentProposal(sql, world);

      const result = await requestProposalChanges(
        claimsFor(world.users.decisionMakerA),
        { proposalId: setup.proposalId, message: 'Podemos dividir o pagamento em três?' },
        depsFor(sql),
      );

      expect(result).toEqual({ ok: true });
      await sql`reset role`;
      const requests = await sql<{ message: string }[]>`
        select message from public.proposal_requests where proposal_id = ${setup.proposalId}
      `;
      expect(requests).toEqual([{ message: 'Podemos dividir o pagamento em três?' }]);
      const events = await sql`
        select id from public.domain_events
        where type = 'contracts.proposal.change_requested'
          and payload ->> 'proposalId' = ${setup.proposalId}
      `;
      expect(events).toHaveLength(1);
    });
  });
});
