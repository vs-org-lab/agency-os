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
import { lisbonDate } from './domain/plan';
import { dealNotice } from './notices';
import { sweepPaymentReminders } from './reminders';
import { createPlanForContract } from './requests';
import { billingDeps } from './runtime';

type BillingEventData = {
  organizationId: string;
  clientId: string | null;
  payload: { dealId: string; contractId?: string; days?: number };
};

type FounderBillingTemplate = Extract<
  EmailTemplateKey,
  'founder.payment_received' | 'founder.payment_review' | 'founder.payment_overdue'
>;

function founderAlertFunction(
  id: string,
  trigger: DomainEventType,
  template: FounderBillingTemplate,
) {
  return inngest.createFunction(
    { id, triggers: [{ event: trigger }], retries: RETRIES, onFailure: failureHandler(id) },
    async ({ event, step }) => {
      const data = event.data as BillingEventData;
      const sent = await step.run('alert-founders', async () => {
        const deps = notificationDeps();
        const notice = await dealNotice(data.payload.dealId, {
          contexts: { withSystemContext },
          appBaseUrl: deps.appBaseUrl,
        });
        if (!notice) return 0;
        const params =
          template === 'founder.payment_overdue'
            ? { ...notice, days: data.payload.days ?? 0 }
            : notice;
        return alertFounders(data.organizationId, template, params as never, deps);
      });
      return { sent };
    },
  );
}

/** AUT-12: a fully signed contract gets its payment plan and first payment request. */
const planOnContractSigned = inngest.createFunction(
  {
    id: 'billing-plan-on-signed',
    triggers: [{ event: 'contracts.contract.signed' }],
    retries: RETRIES,
    onFailure: failureHandler('billing-plan-on-signed'),
  },
  async ({ event, step }) => {
    const { contractId } = (event.data as BillingEventData).payload;
    if (!contractId) return { created: false };
    return step.run('create-plan', () => createPlanForContract(contractId, billingDeps()));
  },
);

/** AUT-19: daily reminders before and after the due date. */
const remindersSweep = inngest.createFunction(
  {
    id: 'billing-reminders',
    triggers: [{ cron: 'TZ=Europe/Lisbon 0 9 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('billing-reminders'),
  },
  async ({ step }) => {
    const reminded = await step.run('sweep-reminders', () =>
      sweepPaymentReminders(lisbonDate(new Date()), { contexts: { withSystemContext } }),
    );
    return { reminded };
  },
);

export const BILLING_FUNCTIONS = [
  planOnContractSigned,
  remindersSweep,
  portalNoticeFunction('billing-request-sent', 'billing.request.sent', 'lead.payment_requested'),
  portalNoticeFunction(
    'billing-request-reminded',
    'billing.request.reminded',
    'lead.payment_reminder',
  ),
  portalNoticeFunction(
    'billing-request-overdue',
    'billing.request.overdue',
    'lead.payment_overdue',
  ),
  portalNoticeFunction(
    'billing-payment-received',
    'billing.payment.received',
    'lead.payment_received',
  ),
  founderAlertFunction(
    'billing-founder-payment-received',
    'billing.payment.received',
    'founder.payment_received',
  ),
  founderAlertFunction(
    'billing-founder-payment-review',
    'billing.payment.review',
    'founder.payment_review',
  ),
  founderAlertFunction(
    'billing-founder-overdue',
    'billing.request.overdue_alert',
    'founder.payment_overdue',
  ),
];
