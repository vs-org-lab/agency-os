import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type World,
} from '@agency-os/db/testing';
import { applyStageChange } from '@/modules/commercial/server';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import { acceptProposal } from './acceptance';
import {
  contractPdfUrl,
  getDealContract,
  getPortalContract,
  signContract,
  voidContract,
  type SigningDeps,
} from './signing';
import { createMemoryContractStorage } from './storage';

afterAll(async () => {
  await closeTestSql();
});

function claimsFor(userId: string, userKind: 'internal' | 'client'): VerifiedClaims {
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
  const storage = createMemoryContractStorage();
  const moveDeal = vi.fn(async () => {});
  const deps: SigningDeps = {
    contexts: createDbContexts(testDatabase(sql)),
    storage,
    moveDeal,
    flush: async () => {},
    now: () => new Date('2026-10-09T10:00:00Z'),
  };
  return { deps, storage, moveDeal };
}

type Generated = { contractId: string; bodyHash: string; dealId: string };

async function generatedContract(sql: TransactionSql, world: World): Promise<Generated> {
  const core = await createCoreFixture(sql, world);
  await sql`
    update public.contacts set portal_user_id = ${world.users.decisionMakerA}, email = 'ana@cliente.test'
    where id = ${core.a.contactId}
  `;
  await sql`update public.deals set pipeline_code = '1.6' where id = ${core.a.dealId}`;
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
    values (${world.organizationId}, 'pt-PT', 1, '# Contrato\n\nCom {{cliente.denominacao}}.', true)
  `;
  const [proposal] = await sql<{ id: string }[]>`
    insert into public.proposals (organization_id, client_id, deal_id, legal_entity_id, currency,
                                  locale, valid_until, status, sent_at)
    values (${world.organizationId}, ${world.clients.a}, ${core.a.dealId}, ${entity.id}, 'EUR',
            'pt-PT', '2099-12-31', 'sent', now())
    returning id
  `;
  if (!proposal) throw new Error('Proposal was not created');
  const [option] = await sql<{ id: string }[]>`
    insert into public.proposal_options (organization_id, client_id, proposal_id, position, name,
                                         scope, one_off_amount, payment_plan)
    values (${world.organizationId}, ${world.clients.a}, ${proposal.id}, 1, 'Orbit essencial',
            '[{"text":"Site","findingId":null}]'::jsonb, 6000,
            '[{"label":"Assinatura","percent":100}]'::jsonb)
    returning id
  `;
  const accepted = await acceptProposal(
    claimsFor(world.users.decisionMakerA, 'client'),
    {
      proposalId: proposal.id,
      optionId: option?.id ?? '',
      company: { legalName: 'Empresa Cliente SA', taxId: '500100200', address: 'Porto' },
      signer: { name: 'Ana Costa', role: 'Administradora' },
    },
    { contexts: createDbContexts(testDatabase(sql)), flush: async () => {} },
  );
  if (!accepted.ok) throw new Error(`Acceptance failed: ${accepted.rule}`);
  await sql`reset role`;
  const [contract] = await sql<{ body_hash: string }[]>`
    select body_hash from public.contracts where id = ${accepted.contractId}
  `;
  return {
    contractId: accepted.contractId,
    bodyHash: contract?.body_hash ?? '',
    dealId: core.a.dealId,
  };
}

function clientSignature(contract: Generated, typedName = 'Ana Costa') {
  return {
    contractId: contract.contractId,
    party: 'client' as const,
    typedName,
    bodyHash: contract.bodyHash,
    ipAddress: '203.0.113.7',
    userAgent: 'Vitest',
  };
}

function studioSignature(contract: Generated) {
  return {
    ...clientSignature(contract, 'vladimir silva'),
    party: 'studio' as const,
    ipAddress: '198.51.100.4',
  };
}

describe('contract signing', () => {
  it('client then studio signature completes the contract', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps, storage, moveDeal } = depsFor(sql);

      expect(
        await signContract(
          claimsFor(world.users.decisionMakerA, 'client'),
          clientSignature(contract),
          deps,
        ),
      ).toEqual({ ok: true, status: 'awaiting_signatures' });
      expect(
        await signContract(
          claimsFor(world.users.founder, 'internal'),
          studioSignature(contract),
          deps,
        ),
      ).toEqual({ ok: true, status: 'signed' });

      await sql`reset role`;
      const [row] = await sql<{ status: string; pdf_path: string; signed: boolean }[]>`
        select status::text, pdf_path, signed_at is not null as signed
        from public.contracts where id = ${contract.contractId}
      `;
      expect(row).toMatchObject({ status: 'signed', signed: true });
      expect(storage.files.has(row?.pdf_path ?? '')).toBe(true);
      const signatures = await sql<{ party: string; ip: string }[]>`
        select party::text, host(ip_address) as ip from public.contract_signatures
        where contract_id = ${contract.contractId} order by party
      `;
      expect(signatures).toEqual([
        { party: 'client', ip: '203.0.113.7' },
        { party: 'studio', ip: '198.51.100.4' },
      ]);
      expect(moveDeal).toHaveBeenCalledTimes(1);
      const events = await sql`
        select type from public.domain_events
        where type in ('contracts.contract.client_signed', 'contracts.contract.signed')
          and payload ->> 'contractId' = ${contract.contractId}
      `;
      expect(events).toHaveLength(2);
    });
  });

  it('studio then client also completes', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);

      await signContract(
        claimsFor(world.users.founder, 'internal'),
        studioSignature(contract),
        deps,
      );
      expect(
        await signContract(
          claimsFor(world.users.decisionMakerA, 'client'),
          clientSignature(contract),
          deps,
        ),
      ).toEqual({ ok: true, status: 'signed' });
    });
  });

  it('a wrong name is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);

      expect(
        await signContract(
          claimsFor(world.users.decisionMakerA, 'client'),
          clientSignature(contract, 'Outra Pessoa'),
          deps,
        ),
      ).toEqual({ ok: false, rule: 'name_mismatch' });
    });
  });

  it('a changed text is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);

      expect(
        await signContract(
          claimsFor(world.users.decisionMakerA, 'client'),
          { ...clientSignature(contract), bodyHash: 'b'.repeat(64) },
          deps,
        ),
      ).toEqual({ ok: false, rule: 'changed' });
    });
  });

  it('signing a voided contract is refused', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);

      expect(
        await voidContract(
          claimsFor(world.users.founder, 'internal'),
          { contractId: contract.contractId, reason: 'Valor errado' },
          deps,
        ),
      ).toEqual({ ok: true });
      expect(
        await signContract(
          claimsFor(world.users.decisionMakerA, 'client'),
          clientSignature(contract),
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });

      await sql`reset role`;
      const [proposal] = await sql<{ status: string }[]>`
        select p.status::text from public.proposals p
        join public.contracts c on c.proposal_id = p.id
        where c.id = ${contract.contractId}
      `;
      expect(proposal?.status).toBe('sent');
    });
  });

  it('signing twice keeps one signature', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);
      const claims = claimsFor(world.users.decisionMakerA, 'client');

      await signContract(claims, clientSignature(contract), deps);
      expect(await signContract(claims, clientSignature(contract), deps)).toEqual({
        ok: true,
        status: 'awaiting_signatures',
      });

      await sql`reset role`;
      const signatures = await sql`
        select id from public.contract_signatures where contract_id = ${contract.contractId}
      `;
      expect(signatures).toHaveLength(1);
    });
  });

  it('only the founder signs for the studio and the decision maker for the client', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);

      expect(
        await signContract(
          claimsFor(world.users.manager, 'internal'),
          studioSignature(contract),
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await signContract(
          claimsFor(world.users.operationalA, 'client'),
          clientSignature(contract),
          deps,
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('the studio sees the contract and its signatures', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);
      await signContract(
        claimsFor(world.users.decisionMakerA, 'client'),
        clientSignature(contract),
        deps,
      );

      const view = await deps.contexts.withUserContext(
        claimsFor(world.users.founder, 'internal'),
        (tx) => getDealContract(tx, contract.dealId),
      );

      expect(view).toMatchObject({
        id: contract.contractId,
        status: 'awaiting_signatures',
        clientSigner: 'Ana Costa',
        studioSigner: 'Vladimir Silva',
      });
      expect(view?.signatures.map((signature) => signature.party)).toEqual(['client']);
    });
  });

  it('gives the signed pdf link to the parties only', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);
      const input = { contractId: contract.contractId };

      expect(
        await contractPdfUrl(claimsFor(world.users.founder, 'internal'), input, deps),
      ).toBeNull();
      await signContract(
        claimsFor(world.users.decisionMakerA, 'client'),
        clientSignature(contract),
        deps,
      );
      await signContract(
        claimsFor(world.users.founder, 'internal'),
        studioSignature(contract),
        deps,
      );

      expect(await contractPdfUrl(claimsFor(world.users.founder, 'internal'), input, deps)).toMatch(
        /^memory:/,
      );
      expect(
        await contractPdfUrl(claimsFor(world.users.decisionMakerA, 'client'), input, deps),
      ).toMatch(/^memory:/);
      expect(
        await contractPdfUrl(claimsFor(world.users.operationalA, 'client'), input, deps),
      ).toBeNull();
    });
  });

  it('shows the contract to the decision maker with the name to type', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);
      const input = { contractId: contract.contractId };

      const view = await getPortalContract(
        claimsFor(world.users.decisionMakerA, 'client'),
        input,
        deps,
      );

      expect(view).toMatchObject({
        id: contract.contractId,
        status: 'awaiting_signatures',
        bodyHash: contract.bodyHash,
        expectedSigner: 'Ana Costa',
        clientSignedAt: null,
      });
      expect(
        await getPortalContract(claimsFor(world.users.operationalA, 'client'), input, deps),
      ).toBeNull();
    });
  });

  it('a closed deal refuses the signature', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);
      await sql`update public.deals set pipeline_code = 'X.4' where id = ${contract.dealId}`;

      expect(
        await signContract(
          claimsFor(world.users.decisionMakerA, 'client'),
          clientSignature(contract),
          deps,
        ),
      ).toEqual({ ok: false, rule: 'invalid_state' });
    });
  });

  it('keeps the studio party of the contract when the entity changes later', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);
      await sql`
        update public.legal_entities set representative_name = 'João Costa', legal_name = 'Outra Lda'
        where organization_id = ${world.organizationId}
      `;

      expect(
        await signContract(
          claimsFor(world.users.founder, 'internal'),
          studioSignature(contract),
          deps,
        ),
      ).toEqual({ ok: true, status: 'awaiting_signatures' });
      const view = await deps.contexts.withUserContext(
        claimsFor(world.users.founder, 'internal'),
        (tx) => getDealContract(tx, contract.dealId),
      );
      expect(view?.studioSigner).toBe('Vladimir Silva');
    });
  });

  it('completion moves the deal to 2.1 through the pipeline rules', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const contract = await generatedContract(sql, world);
      const { deps } = depsFor(sql);
      const realDeps: SigningDeps = {
        ...deps,
        moveDeal: async (tx, dealId) => {
          const change = await applyStageChange(tx, {
            dealId,
            to: '2.1',
            reason: null,
            actor: 'system',
          });
          if (!change.ok) throw new Error(`Move refused: ${change.rule}`);
        },
      };

      await signContract(
        claimsFor(world.users.decisionMakerA, 'client'),
        clientSignature(contract),
        realDeps,
      );
      await signContract(
        claimsFor(world.users.founder, 'internal'),
        studioSignature(contract),
        realDeps,
      );

      await sql`reset role`;
      const [deal] = await sql<{ code: string }[]>`
        select pipeline_code::text as code from public.deals where id = ${contract.dealId}
      `;
      expect(deal?.code).toBe('2.1');
    });
  });
});
