import 'server-only';

export {
  archiveEntity,
  loadContractTemplates,
  loadLegalEntities,
  publishTemplate,
  saveEntity,
  type ContractSession,
  type ContractTemplates,
} from './studio';
export type { LegalEntity, LegalEntityInput } from './entities';
export type { PublishContractTemplateResult } from './templates/service';
