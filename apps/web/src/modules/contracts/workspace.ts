import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { isLocale, type Currency, type Locale } from '@agency-os/i18n';
import type { PipelineCode } from '@/modules/commercial';
import { listLegalEntities } from './entities';
import {
  getDealProposal,
  proposalFindings,
  type ProposalFinding,
  type ProposalView,
} from './proposals';

const { applications, contacts, deals, organizations } = schema;

export type ProposalWorkspace = {
  dealId: string;
  stage: PipelineCode;
  portalAccess: boolean;
  proposal: ProposalView | null;
  findings: ProposalFinding[];
  entities: Array<{ id: string; legalName: string; isDefault: boolean }>;
  defaults: { currency: Currency; locale: Locale };
};

async function leadLocale(
  tx: DbTransaction,
  dealId: string,
  organizationId: string,
): Promise<Locale> {
  const [application] = await tx
    .select({ source: applications.source })
    .from(applications)
    .where(eq(applications.dealId, dealId))
    .orderBy(desc(applications.createdAt))
    .limit(1);
  const locale = (application?.source as { locale?: string } | null)?.locale;
  if (locale && isLocale(locale)) return locale;
  const [organization] = await tx
    .select({ locale: organizations.defaultLocale })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return organization?.locale ?? 'pt-PT';
}

export async function getProposalWorkspace(
  tx: DbTransaction,
  dealId: string,
): Promise<ProposalWorkspace | null> {
  const [deal] = await tx
    .select({
      id: deals.id,
      organizationId: deals.organizationId,
      clientId: deals.clientId,
      pipelineCode: deals.pipelineCode,
      currency: deals.currency,
    })
    .from(deals)
    .where(eq(deals.id, dealId));
  if (!deal) return null;

  const [portalContact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.clientId, deal.clientId), isNotNull(contacts.portalUserId)))
    .limit(1);
  const entities = await listLegalEntities(tx);

  return {
    dealId: deal.id,
    stage: deal.pipelineCode,
    portalAccess: portalContact !== undefined,
    proposal: await getDealProposal(tx, deal.id),
    findings: await proposalFindings(tx, deal.id),
    entities: entities.map(({ id, legalName, isDefault }) => ({ id, legalName, isDefault })),
    defaults: {
      currency: deal.currency,
      locale: await leadLocale(tx, deal.id, deal.organizationId),
    },
  };
}
