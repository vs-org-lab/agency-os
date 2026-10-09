import 'server-only';
import type { DbTransaction } from '@agency-os/db';
import type { Locale } from '@agency-os/i18n';
import { applyStageChange } from '@/modules/commercial/server';
import { logger } from '@/platform/logger';
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
import {
  contractPdfUrl,
  getDealContract,
  getPortalContract,
  signContract,
  voidContract,
  type ContractView,
  type SignContractInput,
} from './signing';
import { createSupabaseContractStorage } from './supabase-storage';
import { activeContractTemplate, publishContractTemplate } from './templates/service';
import { getProposalWorkspace, type ProposalWorkspace } from './workspace';

export type ContractSession = { claims: VerifiedClaims };

/** The project stage a signed contract opens (RN-04). */
const PROJECT_START_CODE = '2.1';

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

async function moveDealToProject(tx: DbTransaction, dealId: string): Promise<void> {
  const change = await applyStageChange(tx, {
    dealId,
    to: PROJECT_START_CODE,
    reason: null,
    actor: 'system',
  });
  if (!change.ok) logger.warn('contracts.deal_not_moved', { dealId, rule: change.rule });
}

function signingDeps() {
  return {
    contexts: portalContexts,
    storage: createSupabaseContractStorage(),
    moveDeal: moveDealToProject,
  };
}

export function loadDealContract(
  session: ContractSession,
  dealId: string,
): Promise<ContractView | null> {
  return withUserContext(session.claims, (tx) => getDealContract(tx, dealId));
}

export function signContractAsStudio(
  session: ContractSession,
  input: Omit<SignContractInput, 'party'>,
) {
  return signContract(session.claims, { ...input, party: 'studio' }, signingDeps());
}

export function voidDealContract(
  session: ContractSession,
  input: { contractId: string; reason: string },
) {
  return voidContract(session.claims, input, signingDeps());
}

export function loadPortalContract(claims: VerifiedClaims, contractId: string) {
  return getPortalContract(claims, { contractId }, signingDeps());
}

export function signContractAsClient(
  claims: VerifiedClaims,
  input: Omit<SignContractInput, 'party'>,
) {
  return signContract(claims, { ...input, party: 'client' }, signingDeps());
}

export function contractDownloadUrl(claims: VerifiedClaims, contractId: string) {
  return contractPdfUrl(claims, { contractId }, signingDeps());
}
