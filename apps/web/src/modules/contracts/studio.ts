import 'server-only';
import type { Locale } from '@agency-os/i18n';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import {
  acceptProposal,
  getPortalProposal,
  requestProposalChanges,
  type AcceptProposalInput,
  type PortalProposal,
} from './acceptance';
import {
  archiveLegalEntity,
  listLegalEntities,
  saveLegalEntity,
  type LegalEntity,
  type LegalEntityInput,
} from './entities';
import {
  saveProposalDraft,
  sendProposal,
  withdrawProposal,
  type ProposalDraftInput,
} from './proposals';
import { activeContractTemplate, publishContractTemplate } from './templates/service';
import { getProposalWorkspace, type ProposalWorkspace } from './workspace';

export type ContractSession = { claims: VerifiedClaims };

export type ContractTemplates = Record<Locale, { version: number; body: string }>;

const contexts = { withUserContext };

export function loadLegalEntities(session: ContractSession): Promise<LegalEntity[]> {
  return withUserContext(session.claims, (tx) => listLegalEntities(tx));
}

export function saveEntity(session: ContractSession, input: LegalEntityInput) {
  return saveLegalEntity(session.claims, input, { contexts });
}

export function archiveEntity(session: ContractSession, input: { entityId: string }) {
  return archiveLegalEntity(session.claims, input, { contexts });
}

export function loadContractTemplates(
  session: ContractSession & { organizationId: string },
): Promise<ContractTemplates> {
  return withUserContext(session.claims, async (tx) => {
    const pt = await activeContractTemplate(tx, session.organizationId, 'pt-PT');
    const en = await activeContractTemplate(tx, session.organizationId, 'en');
    return {
      'pt-PT': { version: pt.version, body: pt.body },
      en: { version: en.version, body: en.body },
    };
  });
}

export function publishTemplate(session: ContractSession, input: { locale: Locale; body: string }) {
  return publishContractTemplate(session.claims, input, { contexts });
}

export function loadProposalWorkspace(
  session: ContractSession,
  dealId: string,
): Promise<ProposalWorkspace | null> {
  return withUserContext(session.claims, (tx) => getProposalWorkspace(tx, dealId));
}

export function saveProposal(session: ContractSession, input: ProposalDraftInput) {
  return saveProposalDraft(session.claims, input, { contexts });
}

export function sendDealProposal(session: ContractSession, input: { proposalId: string }) {
  return sendProposal(session.claims, input, { contexts });
}

export function withdrawDealProposal(session: ContractSession, input: { proposalId: string }) {
  return withdrawProposal(session.claims, input, { contexts });
}

const portalContexts = { withUserContext, withSystemContext };

export function loadPortalProposal(
  claims: VerifiedClaims,
  clientId: string,
): Promise<PortalProposal | null> {
  return withUserContext(claims, (tx) => getPortalProposal(tx, clientId));
}

export function acceptPortalProposal(claims: VerifiedClaims, input: AcceptProposalInput) {
  return acceptProposal(claims, input, { contexts: portalContexts });
}

export function requestPortalProposalChanges(
  claims: VerifiedClaims,
  input: { proposalId: string; message: string },
) {
  return requestProposalChanges(claims, input, { contexts: portalContexts });
}
