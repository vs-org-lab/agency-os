import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeTestSql,
  createCoreFixture,
  createFixtureWorld,
  testDatabase,
  withTestTransaction,
  type CoreFixture,
  type World,
} from '@agency-os/db/testing';
import { createDbContexts, type VerifiedClaims } from '@/platform/db';
import {
  getDealProposal,
  saveProposalDraft,
  sendProposal,
  withdrawProposal,
  type ProposalDraftInput,
} from './proposals';

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

function depsFor(sql: TransactionSql) {
  return { contexts: createDbContexts(testDatabase(sql)), flush: async () => {} };
}

async function prepare(
  sql: TransactionSql,
  world: World,
): Promise<{ core: CoreFixture; entityId: string }> {
  const core = await createCoreFixture(sql, world);
  const [entity] = await sql<{ id: string }[]>`
    insert into public.legal_entities (organization_id, legal_name, tax_id, address, country, email,
                                       representative_name, representative_role, is_default)
    values (${world.organizationId}, 'Aurion Creative Lda', '516000000', 'Lisboa', 'PT',
            'geral@aurion.test', 'Vladimir Silva', 'Gerente', true)
    returning id
  `;
  if (!entity) throw new Error('Entity was not created');
  return { core, entityId: entity.id };
}

async function readyToSend(sql: TransactionSql, world: World, core: CoreFixture): Promise<void> {
  await sql`update public.deals set pipeline_code = '1.6' where id = ${core.a.dealId}`;
  await sql`
    update public.contacts set portal_user_id = ${world.users.decisionMakerA}
    where id = ${core.a.contactId}
  `;
}

function draft(
  dealId: string,
  entityId: string,
  overrides: Partial<ProposalDraftInput> = {},
): ProposalDraftInput {
  const option = (name: string, amount: string) => ({
    name,
    summary: `Resumo de ${name}`,
    scope: [{ text: 'Novo site institucional', findingId: null }],
    oneOffAmount: amount,
    paymentPlan: [
      { label: 'Assinatura', percent: 50 },
      { label: 'Entrega', percent: 50 },
    ],
    retainerMonthly: null,
    retainerMonths: null,
  });
  return {
    dealId,
    legalEntityId: entityId,
    currency: 'EUR',
    locale: 'pt-PT',
    validUntil: '2099-12-31',
    guarantee: 'Garantia de 30 dias',
    options: [
      option('Orbit essencial', '6000.00'),
      option('Orbit com Gravity', '12000.00'),
      { ...option('Sistema completo', '18000.00'), retainerMonthly: '1500.00', retainerMonths: 12 },
    ],
    ...overrides,
  };
}

describe('proposals', () => {
  it('saves a draft with three options', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { core, entityId } = await prepare(sql, world);
      const deps = depsFor(sql);
      const claims = claimsFor(world.users.manager);

      const saved = await saveProposalDraft(claims, draft(core.a.dealId, entityId), deps);
      const again = await saveProposalDraft(
        claims,
        draft(core.a.dealId, entityId, { guarantee: 'Nova garantia' }),
        deps,
      );
      if (!saved.ok || !again.ok) throw new Error('Draft was not saved');
      const view = await deps.contexts.withUserContext(claims, (tx) =>
        getDealProposal(tx, core.a.dealId),
      );

      expect(again.proposalId).toBe(saved.proposalId);
      expect(view?.status).toBe('draft');
      expect(view?.guarantee).toBe('Nova garantia');
      expect(view?.options.map((option) => [option.position, option.name])).toEqual([
        [1, 'Orbit essencial'],
        [2, 'Orbit com Gravity'],
        [3, 'Sistema completo'],
      ]);
      expect(view?.options[2]).toMatchObject({ retainerMonthly: '1500.00', retainerMonths: 12 });
    });
  });

  it('refuses invalid options', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { core, entityId } = await prepare(sql, world);
      const deps = depsFor(sql);
      const claims = claimsFor(world.users.founder);
      const base = draft(core.a.dealId, entityId);
      const [first] = base.options;
      if (!first) throw new Error('Draft has no option');

      for (const options of [
        [],
        [...base.options, first],
        [{ ...first, paymentPlan: [{ label: 'Assinatura', percent: 60 }] }],
        [{ ...first, oneOffAmount: '0' }],
        [{ ...first, retainerMonthly: '100.00', retainerMonths: null }],
      ]) {
        expect(await saveProposalDraft(claims, { ...base, options }, deps)).toEqual({
          ok: false,
          rule: 'invalid_input',
        });
      }
    });
  });

  it('only the founder sends', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { core, entityId } = await prepare(sql, world);
      await readyToSend(sql, world, core);
      const deps = depsFor(sql);
      const saved = await saveProposalDraft(
        claimsFor(world.users.manager),
        draft(core.a.dealId, entityId),
        deps,
      );
      if (!saved.ok) throw new Error('Draft was not saved');

      expect(
        await sendProposal(claimsFor(world.users.manager), { proposalId: saved.proposalId }, deps),
      ).toEqual({ ok: false, rule: 'not_found' });
      expect(
        await sendProposal(claimsFor(world.users.founder), { proposalId: saved.proposalId }, deps),
      ).toEqual({ ok: true });

      await sql`reset role`;
      const events = await sql`
        select id from public.domain_events
        where type = 'contracts.proposal.sent' and payload ->> 'proposalId' = ${saved.proposalId}
      `;
      expect(events).toHaveLength(1);
    });
  });

  it('sending requires stage 1.6 and portal access', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { core, entityId } = await prepare(sql, world);
      const deps = depsFor(sql);
      const founder = claimsFor(world.users.founder);
      const saved = await saveProposalDraft(founder, draft(core.a.dealId, entityId), deps);
      if (!saved.ok) throw new Error('Draft was not saved');

      expect(await sendProposal(founder, { proposalId: saved.proposalId }, deps)).toEqual({
        ok: false,
        rule: 'stage',
      });
      await sql`reset role`;
      await sql`update public.deals set pipeline_code = '1.6' where id = ${core.a.dealId}`;
      expect(await sendProposal(founder, { proposalId: saved.proposalId }, deps)).toEqual({
        ok: false,
        rule: 'portal_access',
      });
    });
  });

  it('a sent proposal is read only and withdraw returns it to draft', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { core, entityId } = await prepare(sql, world);
      await readyToSend(sql, world, core);
      const deps = depsFor(sql);
      const founder = claimsFor(world.users.founder);
      const saved = await saveProposalDraft(founder, draft(core.a.dealId, entityId), deps);
      if (!saved.ok) throw new Error('Draft was not saved');
      await sendProposal(founder, { proposalId: saved.proposalId }, deps);

      expect(await saveProposalDraft(founder, draft(core.a.dealId, entityId), deps)).toEqual({
        ok: false,
        rule: 'locked',
      });
      expect(await withdrawProposal(founder, { proposalId: saved.proposalId }, deps)).toEqual({
        ok: true,
      });
      const view = await deps.contexts.withUserContext(founder, (tx) =>
        getDealProposal(tx, core.a.dealId),
      );
      expect(view?.status).toBe('draft');
    });
  });

  it('the audit names the founder who sent and withdrew', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { core, entityId } = await prepare(sql, world);
      await readyToSend(sql, world, core);
      const deps = depsFor(sql);
      const founder = claimsFor(world.users.founder);
      const saved = await saveProposalDraft(founder, draft(core.a.dealId, entityId), deps);
      if (!saved.ok) throw new Error('Draft was not saved');

      expect(await sendProposal(founder, { proposalId: saved.proposalId }, deps)).toEqual({
        ok: true,
      });
      expect(await withdrawProposal(founder, { proposalId: saved.proposalId }, deps)).toEqual({
        ok: true,
      });
      await sql`reset role`;
      const entries = await sql<{ action: string; actor_user_id: string | null }[]>`
        select action, actor_user_id::text from public.audit_log
        where resource_id = ${saved.proposalId}
          and action in ('proposal.sent', 'proposal.withdrawn')
        order by occurred_at
      `;
      expect(entries).toEqual([
        { action: 'proposal.sent', actor_user_id: world.users.founder },
        { action: 'proposal.withdrawn', actor_user_id: world.users.founder },
      ]);
    });
  });

  it('manager of another client gets not_found', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { core, entityId } = await prepare(sql, world);

      expect(
        await saveProposalDraft(
          claimsFor(world.users.manager),
          draft(core.b.dealId, entityId),
          depsFor(sql),
        ),
      ).toEqual({ ok: false, rule: 'not_found' });
    });
  });

  it('lists the Aurion findings of the 90 day lane', async () => {
    await withTestTransaction(async (sql) => {
      const world = await createFixtureWorld(sql);
      const { core } = await prepare(sql, world);
      const [finding] = await sql<{ id: string }[]>`
        insert into public.core_findings (organization_id, client_id, engagement_id, front, title,
                                          impact, effort, lane, owner)
        values (${world.organizationId}, ${world.clients.a}, ${core.a.engagementId}, 'gravity',
                'Sem rastreamento', 'high', 'high', 'days_90', 'aurion')
        returning id
      `;
      const deps = depsFor(sql);

      const view = await deps.contexts.withUserContext(claimsFor(world.users.founder), (tx) =>
        getDealProposal(tx, core.a.dealId),
      );

      expect(view).toBeNull();
      const findings = await deps.contexts.withUserContext(claimsFor(world.users.founder), (tx) =>
        import('./proposals').then((module) => module.proposalFindings(tx, core.a.dealId)),
      );
      expect(findings).toEqual([{ id: finding?.id, title: 'Sem rastreamento', front: 'gravity' }]);
    });
  });
});
