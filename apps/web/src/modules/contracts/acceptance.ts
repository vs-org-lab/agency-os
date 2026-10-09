import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  schema,
  type DbTransaction,
  type PaymentStep,
  type ProposalClientDetails,
  type ProposalScopeLine,
} from '@agency-os/db';
import type { Currency, Locale } from '@agency-os/i18n';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { renderContract } from './domain/render';
import { contractHash } from './domain/signature';
import { activeContractTemplate } from './templates/service';

const { contacts, contracts, legalEntities, proposalOptions, proposalRequests, proposals } = schema;

export type AcceptanceDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  flush?: () => Promise<void>;
  now?: () => Date;
};

export type PortalProposalOption = {
  id: string;
  position: number;
  name: string;
  summary: string;
  scope: ProposalScopeLine[];
  oneOffAmount: string;
  paymentPlan: PaymentStep[];
  retainerMonthly: string | null;
  retainerMonths: number | null;
};

export type PortalProposal = {
  id: string;
  status: 'sent' | 'accepted';
  currency: Currency;
  locale: Locale;
  validUntil: string;
  guarantee: string;
  entityName: string;
  sentAt: Date | null;
  acceptedOptionId: string | null;
  contractId: string | null;
  expired: boolean;
  options: PortalProposalOption[];
};

export type AcceptProposalInput = {
  proposalId: string;
  optionId: string;
  company: { legalName: string; taxId: string; address: string };
  signer: { name: string; role: string };
};

export type AcceptProposalResult =
  | { ok: true; contractId: string }
  | { ok: false; rule: 'not_found' | 'invalid_input' | 'expired' | 'invalid_state' };

const NOT_FOUND = { ok: false, rule: 'not_found' } as const;

const text = (max: number) => z.string().trim().min(1).max(max);

const acceptSchema = z.object({
  proposalId: z.uuid(),
  optionId: z.uuid(),
  company: z.object({ legalName: text(200), taxId: text(40), address: text(500) }),
  signer: z.object({ name: text(200), role: text(120) }),
});

function parsedJson<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

type VisibleProposal = { id: string; client_id: string; status: string; valid_until: string };

/** Reads a proposal through the decision maker portal view, so only that role ever passes. */
async function visibleProposal(
  tx: DbTransaction,
  proposalId: string,
): Promise<VisibleProposal | null> {
  const rows = await tx.execute<VisibleProposal>(sql`
    select id, client_id, status::text as status, valid_until::text as valid_until
    from public.portal_proposals
    where id = ${proposalId}::uuid
  `);
  return rows[0] ?? null;
}

export async function getPortalProposal(
  tx: DbTransaction,
  clientId: string,
  now: Date = new Date(),
): Promise<PortalProposal | null> {
  const rows = await tx.execute<{
    id: string;
    status: 'sent' | 'accepted';
    currency: Currency;
    locale: Locale;
    valid_until: string;
    guarantee: string;
    entity_name: string;
    sent_at: string | Date | null;
    accepted_option_id: string | null;
  }>(sql`
    select id, status::text as status, currency::text as currency, locale::text as locale,
           valid_until::text as valid_until, guarantee, entity_name, sent_at, accepted_option_id
    from public.portal_proposals
    where client_id = ${clientId}::uuid
    order by sent_at desc nulls last
    limit 1
  `);
  const proposal = rows[0];
  if (!proposal) return null;

  const options = await tx.execute<{
    id: string;
    position: number;
    name: string;
    summary: string;
    scope: unknown;
    one_off_amount: string;
    payment_plan: unknown;
    retainer_monthly: string | null;
    retainer_months: number | null;
  }>(sql`
    select id, position, name, summary, scope, one_off_amount::text as one_off_amount,
           payment_plan, retainer_monthly::text as retainer_monthly, retainer_months
    from public.portal_proposal_options
    where proposal_id = ${proposal.id}::uuid
    order by position
  `);

  const contractRows = await tx.execute<{ id: string }>(sql`
    select id from public.portal_contracts
    where proposal_id = ${proposal.id}::uuid
    order by created_at desc
    limit 1
  `);

  return {
    id: proposal.id,
    status: proposal.status,
    currency: proposal.currency,
    locale: proposal.locale,
    validUntil: proposal.valid_until,
    guarantee: proposal.guarantee,
    entityName: proposal.entity_name,
    sentAt: proposal.sent_at ? new Date(proposal.sent_at) : null,
    acceptedOptionId: proposal.accepted_option_id,
    contractId: contractRows[0]?.id ?? null,
    expired: proposal.status === 'sent' && proposal.valid_until < today(now),
    options: options.map((option) => ({
      id: option.id,
      position: Number(option.position),
      name: option.name,
      summary: option.summary,
      scope: parsedJson<ProposalScopeLine[]>(option.scope),
      oneOffAmount: option.one_off_amount,
      paymentPlan: parsedJson<PaymentStep[]>(option.payment_plan),
      retainerMonthly: option.retainer_monthly,
      retainerMonths: option.retainer_months === null ? null : Number(option.retainer_months),
    })),
  };
}

async function openContractOf(tx: DbTransaction, proposalId: string): Promise<string | null> {
  const [contract] = await tx
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.proposalId, proposalId), ne(contracts.status, 'void')));
  return contract?.id ?? null;
}

/**
 * The decision maker accepts one option: the contract is generated from the active template of
 * the proposal language and its text is fixed with a SHA-256 fingerprint. Repeated requests return
 * the contract already generated.
 */
export async function acceptProposal(
  claims: VerifiedClaims,
  input: AcceptProposalInput,
  deps: AcceptanceDeps,
): Promise<AcceptProposalResult> {
  if (!z.uuid().safeParse(input.proposalId).success) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();
  const visible = await deps.contexts.withUserContext(claims, (tx) =>
    visibleProposal(tx, input.proposalId),
  );
  if (!visible) return NOT_FOUND;
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  if (visible.status === 'sent' && visible.valid_until < today(now)) {
    return { ok: false, rule: 'expired' };
  }
  const data = parsed.data;

  const result = await deps.contexts.withSystemContext(
    async (tx): Promise<AcceptProposalResult & { emitted?: boolean }> => {
      const [proposal] = await tx
        .select({
          id: proposals.id,
          organizationId: proposals.organizationId,
          clientId: proposals.clientId,
          dealId: proposals.dealId,
          legalEntityId: proposals.legalEntityId,
          currency: proposals.currency,
          locale: proposals.locale,
          guarantee: proposals.guarantee,
          status: proposals.status,
        })
        .from(proposals)
        .where(eq(proposals.id, data.proposalId))
        .for('update');
      if (!proposal) return NOT_FOUND;
      if (proposal.status === 'accepted') {
        const existing = await openContractOf(tx, proposal.id);
        return existing ? { ok: true, contractId: existing } : { ok: false, rule: 'invalid_state' };
      }
      if (proposal.status !== 'sent') return { ok: false, rule: 'invalid_state' };

      const [option] = await tx
        .select()
        .from(proposalOptions)
        .where(
          and(eq(proposalOptions.id, data.optionId), eq(proposalOptions.proposalId, proposal.id)),
        );
      const [entity] = await tx
        .select()
        .from(legalEntities)
        .where(eq(legalEntities.id, proposal.legalEntityId));
      if (!option || !entity) return NOT_FOUND;
      const [contact] = await tx
        .select({ email: contacts.email })
        .from(contacts)
        .where(
          and(
            eq(contacts.clientId, proposal.clientId),
            eq(contacts.portalUserId, claims.sub),
            isNotNull(contacts.email),
          ),
        )
        .limit(1);

      const details: ProposalClientDetails = {
        legalName: data.company.legalName,
        taxId: data.company.taxId,
        address: data.company.address,
        signerName: data.signer.name,
        signerRole: data.signer.role,
        signerEmail: contact?.email ?? '',
      };
      const template = await activeContractTemplate(tx, proposal.organizationId, proposal.locale);
      const body = renderContract(
        template.body,
        {
          entity: {
            legalName: entity.legalName,
            taxId: entity.taxId,
            address: entity.address,
            country: entity.country,
            representativeName: entity.representativeName,
            representativeRole: entity.representativeRole,
          },
          client: {
            legalName: details.legalName,
            taxId: details.taxId,
            address: details.address,
            signerName: details.signerName,
            signerRole: details.signerRole,
          },
          option: {
            name: option.name,
            summary: option.summary,
            scope: option.scope.map((line) => line.text),
            oneOffAmount: option.oneOffAmount,
            paymentPlan: option.paymentPlan,
            retainerMonthly: option.retainerMonthly,
            retainerMonths: option.retainerMonths,
          },
          proposal: { guarantee: proposal.guarantee, currency: proposal.currency },
          contractDate: now,
        },
        proposal.locale,
      );

      await tx
        .update(proposals)
        .set({
          status: 'accepted',
          acceptedAt: now,
          acceptedBy: claims.sub,
          acceptedOptionId: option.id,
          clientDetails: details,
        })
        .where(eq(proposals.id, proposal.id));
      const [contract] = await tx
        .insert(contracts)
        .values({
          organizationId: proposal.organizationId,
          clientId: proposal.clientId,
          dealId: proposal.dealId,
          proposalId: proposal.id,
          optionId: option.id,
          templateId: template.id,
          legalEntityId: entity.id,
          locale: proposal.locale,
          body,
          bodyHash: contractHash(body),
        })
        .returning({ id: contracts.id });
      if (!contract) throw new Error('Contract was not generated');

      await recordAudit(tx, {
        organizationId: proposal.organizationId,
        action: 'proposal.accepted',
        resourceType: 'proposal',
        resourceId: proposal.id,
        clientId: proposal.clientId,
        metadata: { optionId: option.id, acceptedBy: claims.sub },
      });
      await recordAudit(tx, {
        organizationId: proposal.organizationId,
        action: 'contract.generated',
        resourceType: 'contract',
        resourceId: contract.id,
        clientId: proposal.clientId,
        metadata: { proposalId: proposal.id, templateVersion: template.version },
      });
      await emit(tx, {
        type: 'contracts.proposal.accepted',
        organizationId: proposal.organizationId,
        clientId: proposal.clientId,
        payload: { proposalId: proposal.id, contractId: contract.id, dealId: proposal.dealId },
      });
      return { ok: true, contractId: contract.id, emitted: true };
    },
  );

  if (!result.ok) return result;
  if (result.emitted) await (deps.flush ?? requestFlush)();
  return { ok: true, contractId: result.contractId };
}

export async function requestProposalChanges(
  claims: VerifiedClaims,
  input: { proposalId: string; message: string },
  deps: AcceptanceDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  if (!z.uuid().safeParse(input.proposalId).success) return NOT_FOUND;
  const visible = await deps.contexts.withUserContext(claims, (tx) =>
    visibleProposal(tx, input.proposalId),
  );
  if (!visible || visible.status !== 'sent') return NOT_FOUND;
  const message = input.message.trim();
  if (message.length === 0 || message.length > 2000) return { ok: false, rule: 'invalid_input' };

  await deps.contexts.withSystemContext(async (tx) => {
    const [proposal] = await tx
      .select({
        organizationId: proposals.organizationId,
        clientId: proposals.clientId,
        dealId: proposals.dealId,
      })
      .from(proposals)
      .where(eq(proposals.id, input.proposalId));
    if (!proposal) return;
    const [request] = await tx
      .insert(proposalRequests)
      .values({
        organizationId: proposal.organizationId,
        clientId: proposal.clientId,
        proposalId: input.proposalId,
        authorId: claims.sub,
        message,
      })
      .returning({ id: proposalRequests.id });
    await recordAudit(tx, {
      organizationId: proposal.organizationId,
      action: 'proposal.changes_requested',
      resourceType: 'proposal',
      resourceId: input.proposalId,
      clientId: proposal.clientId,
      metadata: { requestId: request?.id ?? null },
    });
    await emit(tx, {
      type: 'contracts.proposal.change_requested',
      organizationId: proposal.organizationId,
      clientId: proposal.clientId,
      payload: { proposalId: input.proposalId, dealId: proposal.dealId },
    });
  });
  await (deps.flush ?? requestFlush)();
  return { ok: true };
}
