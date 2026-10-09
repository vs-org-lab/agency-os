import 'server-only';
import {
  alertFounders,
  failureHandler,
  notificationDeps,
  portalNoticeFunction,
  RETRIES,
} from '@/modules/commercial/server';
import { inngest, type DomainEventType } from '@/modules/events';
import type { EmailTemplateKey } from '@/modules/email';
import { withSystemContext } from '@/platform/db';
import { founderNotice } from './notices';

type ContractEventData = {
  organizationId: string;
  clientId: string | null;
  payload: { dealId: string; proposalId?: string };
};

type FounderContractTemplate = Extract<
  EmailTemplateKey,
  | 'founder.proposal_accepted'
  | 'founder.proposal_changes'
  | 'founder.contract_client_signed'
  | 'founder.contract_signed'
>;

function founderAlertFunction(
  id: string,
  trigger: DomainEventType,
  template: FounderContractTemplate,
) {
  return inngest.createFunction(
    { id, triggers: [{ event: trigger }], retries: RETRIES, onFailure: failureHandler(id) },
    async ({ event, step }) => {
      const data = event.data as ContractEventData;
      const sent = await step.run('alert-founders', async () => {
        const deps = notificationDeps();
        const notice = await founderNotice(data.payload, {
          contexts: { withSystemContext },
          appBaseUrl: deps.appBaseUrl,
        });
        if (!notice) return 0;
        const params =
          template === 'founder.proposal_accepted'
            ? notice
            : { companyName: notice.companyName, dealUrl: notice.dealUrl };
        return alertFounders(data.organizationId, template, params as never, deps);
      });
      return { sent };
    },
  );
}

export const CONTRACT_FUNCTIONS = [
  portalNoticeFunction(
    'contracts-proposal-shared',
    'contracts.proposal.sent',
    'lead.proposal_shared',
  ),
  portalNoticeFunction(
    'contracts-contract-ready',
    'contracts.proposal.accepted',
    'lead.contract_ready',
  ),
  portalNoticeFunction(
    'contracts-contract-signed-client',
    'contracts.contract.signed',
    'lead.contract_signed',
  ),
  founderAlertFunction(
    'contracts-proposal-accepted',
    'contracts.proposal.accepted',
    'founder.proposal_accepted',
  ),
  founderAlertFunction(
    'contracts-proposal-changes',
    'contracts.proposal.change_requested',
    'founder.proposal_changes',
  ),
  founderAlertFunction(
    'contracts-client-signed',
    'contracts.contract.client_signed',
    'founder.contract_client_signed',
  ),
  founderAlertFunction(
    'contracts-contract-signed',
    'contracts.contract.signed',
    'founder.contract_signed',
  ),
];
