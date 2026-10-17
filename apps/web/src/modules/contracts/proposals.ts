import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  schema,
  type DbTransaction,
  type OrbitFront,
  type PaymentStep,
  type ProposalScopeLine,
  type ProposalStatus,
} from '@agency-os/db';
import { currencies, type Currency, type Locale } from '@agency-os/i18n';
import { authorize, loadAccessContext, withActor, type Actor } from '@/modules/access';
import { recordAudit } from '@/modules/audit';
import { isFounderActor } from '@/modules/commercial';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { validatePaymentPlan } from './domain/payments';

const {
  contacts,
  coreEngagements,
  coreFindings,
  deals,
  legalEntities,
  proposalOptions,
  proposalRequests,
  proposals,
} = schema;

export const MAX_PROPOSAL_OPTIONS = 3;
export const PROPOSAL_STAGE = '1.6';

export type ProposalOptionInput = {
  name: string;
  summary: string;
  scope: ProposalScopeLine[];
  oneOffAmount: string;
  paymentPlan: PaymentStep[];
  retainerMonthly: string | null;
  retainerMonths: number | null;
};

export type ProposalDraftInput = {
  dealId: string;
  legalEntityId: string;
  currency: Currency;
  locale: Locale;
  validUntil: string;
  guarantee: string;
  options: ProposalOptionInput[];
};

export type ProposalOptionView = ProposalOptionInput & { id: string; position: number };

export type ProposalView = {
  id: string;
  status: ProposalStatus;
  legalEntityId: string;
  currency: Currency;
  locale: Locale;
  validUntil: string;
  guarantee: string;
  sentAt: Date | null;
  acceptedAt: Date | null;
  acceptedOptionId: string | null;
  options: ProposalOptionView[];
  requests: Array<{ id: string; message: string; createdAt: Date }>;
};

export type ProposalFinding = { id: string; title: string; front: OrbitFront };

export type ProposalDeps = {
  contexts: Pick<DbContexts, 'withUserContext'>;
  flush?: () => Promise<void>;
};

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

const money = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0);

const optionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    summary: z.string().trim().max(2000),
    scope: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(300),
          findingId: z.uuid().nullable(),
        }),
      )
      .min(1)
      .max(30),
    oneOffAmount: money,
    paymentPlan: z.array(z.object({ label: z.string(), percent: z.number() })),
    retainerMonthly: money.nullable(),
    retainerMonths: z.number().int().min(1).max(36).nullable(),
  })
  .refine((option) => validatePaymentPlan(option.paymentPlan))
  .refine((option) => (option.retainerMonthly === null) === (option.retainerMonths === null));

const draftSchema = z.object({
  dealId: z.uuid(),
  legalEntityId: z.uuid(),
  currency: z.enum(currencies),
  locale: z.enum(['pt-PT', 'en']),
  validUntil: z.iso.date(),
  guarantee: z.string().trim().max(2000),
  options: z.array(optionSchema).min(1).max(MAX_PROPOSAL_OPTIONS),
});

type DealScope = { id: string; organizationId: string; clientId: string; pipelineCode: string };

async function dealFor(
  tx: DbTransaction,
  actor: Actor,
  dealId: string,
  action: 'read' | 'write',
): Promise<DealScope | null> {
  const [deal] = await tx
    .select({
      id: deals.id,
      organizationId: deals.organizationId,
      clientId: deals.clientId,
      pipelineCode: deals.pipelineCode,
    })
    .from(deals)
    .where(eq(deals.id, dealId));
  if (!deal) return null;
  const ctx = await loadAccessContext(tx, actor);
  return authorize(actor, action, { type: 'pipeline', clientId: deal.clientId }, ctx).allowed
    ? deal
    : null;
}

async function currentProposal(tx: DbTransaction, dealId: string) {
  const [proposal] = await tx
    .select({ id: proposals.id, status: proposals.status })
    .from(proposals)
    .where(and(eq(proposals.dealId, dealId), ne(proposals.status, 'withdrawn')))
    .orderBy(desc(proposals.createdAt))
    .limit(1);
  return proposal ?? null;
}

async function engagementFindingIds(tx: DbTransaction, dealId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ id: coreFindings.id })
    .from(coreFindings)
    .innerJoin(coreEngagements, eq(coreEngagements.id, coreFindings.engagementId))
    .where(eq(coreEngagements.dealId, dealId));
  return new Set(rows.map((row) => row.id));
}

export async function proposalFindings(
  tx: DbTransaction,
  dealId: string,
): Promise<ProposalFinding[]> {
  return tx
    .select({ id: coreFindings.id, title: coreFindings.title, front: coreFindings.front })
    .from(coreFindings)
    .innerJoin(coreEngagements, eq(coreEngagements.id, coreFindings.engagementId))
    .where(
      and(
        eq(coreEngagements.dealId, dealId),
        eq(coreFindings.owner, 'aurion'),
        eq(coreFindings.lane, 'days_90'),
      ),
    )
    .orderBy(asc(coreFindings.position), asc(coreFindings.createdAt));
}

export async function getDealProposal(
  tx: DbTransaction,
  dealId: string,
): Promise<ProposalView | null> {
  const [proposal] = await tx
    .select({
      id: proposals.id,
      status: proposals.status,
      legalEntityId: proposals.legalEntityId,
      currency: proposals.currency,
      locale: proposals.locale,
      validUntil: proposals.validUntil,
      guarantee: proposals.guarantee,
      sentAt: proposals.sentAt,
      acceptedAt: proposals.acceptedAt,
      acceptedOptionId: proposals.acceptedOptionId,
    })
    .from(proposals)
    .where(and(eq(proposals.dealId, dealId), ne(proposals.status, 'withdrawn')))
    .orderBy(desc(proposals.createdAt))
    .limit(1);
  if (!proposal) return null;

  const options = await tx
    .select({
      id: proposalOptions.id,
      position: proposalOptions.position,
      name: proposalOptions.name,
      summary: proposalOptions.summary,
      scope: proposalOptions.scope,
      oneOffAmount: proposalOptions.oneOffAmount,
      paymentPlan: proposalOptions.paymentPlan,
      retainerMonthly: proposalOptions.retainerMonthly,
      retainerMonths: proposalOptions.retainerMonths,
    })
    .from(proposalOptions)
    .where(eq(proposalOptions.proposalId, proposal.id))
    .orderBy(asc(proposalOptions.position));
  const requests = await tx
    .select({
      id: proposalRequests.id,
      message: proposalRequests.message,
      createdAt: proposalRequests.createdAt,
    })
    .from(proposalRequests)
    .where(eq(proposalRequests.proposalId, proposal.id))
    .orderBy(desc(proposalRequests.createdAt));

  return { ...proposal, options, requests };
}

export function saveProposalDraft(
  claims: VerifiedClaims,
  input: ProposalDraftInput,
  deps: ProposalDeps,
): Promise<
  { ok: true; proposalId: string } | NotFound | { ok: false; rule: 'invalid_input' | 'locked' }
> {
  const parsed = draftSchema.safeParse(input);
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      const deal = await dealFor(tx, actor, input.dealId, 'write');
      if (!deal) return NOT_FOUND;
      if (!parsed.success) return { ok: false as const, rule: 'invalid_input' as const };
      const data = parsed.data;

      const [entity] = await tx
        .select({ id: legalEntities.id })
        .from(legalEntities)
        .where(and(eq(legalEntities.id, data.legalEntityId), isNull(legalEntities.archivedAt)));
      const knownFindings = await engagementFindingIds(tx, deal.id);
      const findingsValid = data.options.every((option) =>
        option.scope.every((line) => line.findingId === null || knownFindings.has(line.findingId)),
      );
      if (!entity || !findingsValid || data.validUntil < new Date().toISOString().slice(0, 10)) {
        return { ok: false as const, rule: 'invalid_input' as const };
      }

      const current = await currentProposal(tx, deal.id);
      if (current && current.status !== 'draft') {
        return { ok: false as const, rule: 'locked' as const };
      }
      const fields = {
        legalEntityId: data.legalEntityId,
        currency: data.currency,
        locale: data.locale,
        validUntil: data.validUntil,
        guarantee: data.guarantee,
        authorId: actor.userId,
      };
      let proposalId = current?.id;
      if (proposalId) {
        await tx.update(proposals).set(fields).where(eq(proposals.id, proposalId));
        await tx.delete(proposalOptions).where(eq(proposalOptions.proposalId, proposalId));
      } else {
        const [created] = await tx
          .insert(proposals)
          .values({
            ...fields,
            organizationId: deal.organizationId,
            clientId: deal.clientId,
            dealId: deal.id,
          })
          .returning({ id: proposals.id });
        if (!created) throw new Error('Proposal was not created');
        proposalId = created.id;
      }
      await tx.insert(proposalOptions).values(
        data.options.map((option, index) => ({
          organizationId: deal.organizationId,
          clientId: deal.clientId,
          proposalId: proposalId as string,
          position: index + 1,
          name: option.name,
          summary: option.summary,
          scope: option.scope,
          oneOffAmount: option.oneOffAmount,
          paymentPlan: option.paymentPlan.map((step) => ({
            label: step.label.trim(),
            percent: step.percent,
          })),
          retainerMonthly: option.retainerMonthly,
          retainerMonths: option.retainerMonths,
        })),
      );
      await recordAudit(tx, {
        organizationId: deal.organizationId,
        action: 'proposal.saved',
        resourceType: 'proposal',
        resourceId: proposalId,
        clientId: deal.clientId,
        metadata: { options: data.options.length },
      });
      return { ok: true as const, proposalId };
    },
    NOT_FOUND,
  );
}

async function proposalFor(tx: DbTransaction, actor: Actor, proposalId: string) {
  if (!z.uuid().safeParse(proposalId).success) return null;
  const [proposal] = await tx
    .select({
      id: proposals.id,
      dealId: proposals.dealId,
      status: proposals.status,
      validUntil: proposals.validUntil,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId));
  if (!proposal) return null;
  const deal = await dealFor(tx, actor, proposal.dealId, 'write');
  return deal ? { proposal, deal } : null;
}

/**
 * Moves a proposal between draft and sent through `app.set_proposal_status`, which checks the
 * founder, locks the row and changes it in this same transaction, so the audit names the founder.
 */
async function changeProposalStatus(
  tx: DbTransaction,
  proposalId: string,
  from: 'draft' | 'sent',
  to: 'draft' | 'sent',
): Promise<boolean> {
  const rows = await tx.execute<{ changed: boolean }>(sql`
    select app.set_proposal_status(
      ${proposalId}::uuid, ${from}::app.proposal_status, ${to}::app.proposal_status
    ) as changed
  `);
  return rows[0]?.changed === true;
}

export async function sendProposal(
  claims: VerifiedClaims,
  input: { proposalId: string },
  deps: ProposalDeps,
): Promise<
  { ok: true } | NotFound | { ok: false; rule: 'invalid_state' | 'stage' | 'portal_access' }
> {
  const result = await withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return NOT_FOUND;
      const scoped = await proposalFor(tx, actor, input.proposalId);
      if (!scoped) return NOT_FOUND;
      const { proposal, deal } = scoped;
      if (proposal.status !== 'draft') {
        return { ok: false as const, rule: 'invalid_state' as const };
      }
      if (deal.pipelineCode !== PROPOSAL_STAGE)
        return { ok: false as const, rule: 'stage' as const };
      const [portalContact] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.clientId, deal.clientId), isNotNull(contacts.portalUserId)))
        .limit(1);
      if (!portalContact) return { ok: false as const, rule: 'portal_access' as const };
      if (proposal.validUntil < new Date().toISOString().slice(0, 10)) {
        return { ok: false as const, rule: 'invalid_state' as const };
      }

      if (!(await changeProposalStatus(tx, proposal.id, 'draft', 'sent'))) {
        return { ok: false as const, rule: 'invalid_state' as const };
      }
      await recordAudit(tx, {
        organizationId: deal.organizationId,
        action: 'proposal.sent',
        resourceType: 'proposal',
        resourceId: proposal.id,
        clientId: deal.clientId,
        metadata: {},
      });
      await emit(tx, {
        type: 'contracts.proposal.sent',
        organizationId: deal.organizationId,
        clientId: deal.clientId,
        payload: { proposalId: proposal.id, dealId: deal.id },
      });
      return { ok: true as const };
    },
    NOT_FOUND,
  );
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

export function withdrawProposal(
  claims: VerifiedClaims,
  input: { proposalId: string },
  deps: ProposalDeps,
): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_state' }> {
  return withActor(
    deps.contexts,
    claims,
    async (tx, actor) => {
      if (!isFounderActor(actor)) return NOT_FOUND;
      const scoped = await proposalFor(tx, actor, input.proposalId);
      if (!scoped) return NOT_FOUND;
      if (!(await changeProposalStatus(tx, scoped.proposal.id, 'sent', 'draft'))) {
        return { ok: false as const, rule: 'invalid_state' as const };
      }
      await recordAudit(tx, {
        organizationId: scoped.deal.organizationId,
        action: 'proposal.withdrawn',
        resourceType: 'proposal',
        resourceId: scoped.proposal.id,
        clientId: scoped.deal.clientId,
        metadata: {},
      });
      return { ok: true as const };
    },
    NOT_FOUND,
  );
}
