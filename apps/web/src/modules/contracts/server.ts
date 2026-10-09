import 'server-only';

export {
  acceptPortalProposal,
  archiveEntity,
  loadPortalProposal,
  requestPortalProposalChanges,
  loadContractTemplates,
  loadLegalEntities,
  loadProposalWorkspace,
  saveProposal,
  sendDealProposal,
  withdrawDealProposal,
  publishTemplate,
  saveEntity,
  type ContractSession,
  type ContractTemplates,
} from './studio';
export type { LegalEntity, LegalEntityInput } from './entities';
export type { PublishContractTemplateResult } from './templates/service';
export type {
  ProposalDraftInput,
  ProposalFinding,
  ProposalOptionInput,
  ProposalOptionView,
  ProposalView,
} from './proposals';
export type { ProposalWorkspace } from './workspace';
export type {
  AcceptProposalInput,
  AcceptProposalResult,
  PortalProposal,
  PortalProposalOption,
} from './acceptance';
