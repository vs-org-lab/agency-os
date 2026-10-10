import 'server-only';
import { isPipelineCode } from '@/modules/commercial';
import {
  alertClientTeam,
  applyStageChange,
  clientPortalNoticeFunction,
  clientTimeZone,
  failureHandler,
  notificationDeps,
  RETRIES,
  sendClientPortalNotice,
} from '@/modules/commercial/server';
import { nextAllowedSendTime } from '@/modules/email';
import type { DbTransaction } from '@agency-os/db';
import { inngest, type DomainEventType } from '@/modules/events';
import type { EmailTemplateKey } from '@/modules/email';
import { withSystemContext } from '@/platform/db';
import { completeDelivery, completeDeliveryForDeal } from './delivery';
import { approvalNotice } from './notices';
import { createProjectForDeal } from './projects';
import { sweepApprovalReminders } from './reminders';
import { roomsDeps } from './runtime';

type RoomEventData = {
  organizationId: string;
  clientId: string | null;
  payload: { dealId?: string; to?: string; approvalId?: string };
};

/** The pipeline code the first payment opens (AUT-13 starts the process there). */
const KICKOFF_CODE = '2.2';

/** AUT-13: the deal reaching 2.2 starts its project with the default process. */
const projectOnKickoff = inngest.createFunction(
  {
    id: 'rooms-project-on-kickoff',
    triggers: [{ event: 'commercial.deal.stage_changed' }],
    retries: RETRIES,
    onFailure: failureHandler('rooms-project-on-kickoff'),
  },
  async ({ event, step }) => {
    const { dealId, to } = (event.data as RoomEventData).payload;
    if (to !== KICKOFF_CODE || !dealId) return { created: false };
    return step.run('create-project', () => createProjectForDeal(dealId, roomsDeps()));
  },
);

type ApprovalTemplate = Extract<
  EmailTemplateKey,
  'founder.approval_decided' | 'founder.approval_overdue'
>;

function approvalAlertFunction(id: string, trigger: DomainEventType, template: ApprovalTemplate) {
  return inngest.createFunction(
    { id, triggers: [{ event: trigger }], retries: RETRIES, onFailure: failureHandler(id) },
    async ({ event, step }) => {
      const data = event.data as RoomEventData;
      const approvalId = data.payload.approvalId;
      if (!approvalId) return { sent: 0 };
      const clientId = data.clientId;
      if (!clientId) return { sent: 0 };
      const sent = await step.run('alert-client-team', async () => {
        const deps = notificationDeps();
        const notice = await approvalNotice(approvalId, {
          contexts: { withSystemContext },
          appBaseUrl: deps.appBaseUrl,
        });
        if (!notice) return 0;
        const params =
          template === 'founder.approval_overdue'
            ? {
                companyName: notice.companyName,
                phaseName: notice.phaseName,
                subject: notice.subject,
                roomUrl: notice.roomUrl,
              }
            : notice;
        return alertClientTeam(data.organizationId, clientId, template, params as never, deps);
      });
      return { sent };
    },
  );
}

/** AUT-15: daily reminders and alerts for approvals left pending. */
const approvalReminders = inngest.createFunction(
  {
    id: 'rooms-approval-reminders',
    triggers: [{ cron: 'TZ=Europe/Lisbon 0 9 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('rooms-approval-reminders'),
  },
  async ({ step }) =>
    step.run('sweep-approvals', () =>
      sweepApprovalReminders(new Date(), { contexts: { withSystemContext } }),
    ),
);

/** Moves the deal as the system for the delivery; a refused move resolves false. */
function deliveryDeps() {
  return {
    contexts: { withSystemContext },
    moveDeal: async (tx: DbTransaction, dealId: string, code: string) => {
      if (!isPipelineCode(code)) return false;
      const change = await applyStageChange(tx, {
        dealId,
        to: code,
        reason: null,
        actor: 'system',
      });
      return change.ok;
    },
  };
}

/**
 * AUT-21: a delivered project moves the deal to 2.10 when nothing is left to request, the founder
 * gets the celebration box and activation proposal tasks and the decision maker is asked for a
 * testimonial. The final invoice runs in billing on the same event, so a billing failure never
 * holds these back.
 */
const projectDelivered = inngest.createFunction(
  {
    id: 'rooms-project-delivered',
    triggers: [{ event: 'rooms.project.delivered' }],
    retries: RETRIES,
    onFailure: failureHandler('rooms-project-delivered'),
  },
  async ({ event, step }) => {
    const data = event.data as { clientId: string | null; payload: { projectId?: string } };
    const { projectId } = data.payload;
    if (!projectId || !data.clientId) return { delivered: false };
    const clientId = data.clientId;
    const completed = await step.run('complete-delivery', () =>
      completeDelivery(projectId, deliveryDeps()),
    );
    const sendAt = await step.run('quiet-hours-send-time', async () =>
      nextAllowedSendTime(
        new Date(),
        await clientTimeZone(clientId, notificationDeps()),
      ).toISOString(),
    );
    await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
    const asked = await step.run('testimonial-request', () =>
      sendClientPortalNotice(clientId, 'lead.testimonial_request', notificationDeps(), {
        path: `/testimonial/${projectId}`,
      }),
    );
    return { delivered: true, ...completed, asked };
  },
);

/**
 * RN-04: a request issued for a deal whose project is already delivered (the final invoice, or a
 * milestone requested by hand afterwards) may now let the deal reach 2.10.
 */
const deliveryOnRequestSent = inngest.createFunction(
  {
    id: 'rooms-delivery-on-request-sent',
    triggers: [{ event: 'billing.request.sent' }],
    retries: RETRIES,
    onFailure: failureHandler('rooms-delivery-on-request-sent'),
  },
  async ({ event, step }) => {
    const { dealId } = (event.data as { payload: { dealId?: string } }).payload;
    if (!dealId) return { moved: false, tasks: 0 };
    return step.run('complete-delivery', () => completeDeliveryForDeal(dealId, deliveryDeps()));
  },
);

export const ROOM_FUNCTIONS = [
  projectOnKickoff,
  projectDelivered,
  deliveryOnRequestSent,
  approvalReminders,
  clientPortalNoticeFunction(
    'rooms-update-published',
    'rooms.update.published',
    'lead.room_update',
  ),
  clientPortalNoticeFunction('rooms-step-shared', 'rooms.step.shared', 'lead.step_shared'),
  clientPortalNoticeFunction(
    'rooms-approval-requested',
    'rooms.approval.requested',
    'lead.approval_requested',
  ),
  clientPortalNoticeFunction(
    'rooms-approval-reminded',
    'rooms.approval.reminded',
    'lead.approval_reminder',
  ),
  approvalAlertFunction(
    'rooms-approval-decided',
    'rooms.approval.decided',
    'founder.approval_decided',
  ),
  approvalAlertFunction(
    'rooms-approval-overdue',
    'rooms.approval.overdue',
    'founder.approval_overdue',
  ),
];
