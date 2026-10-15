import 'server-only';
import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import {
  alertClientTeam,
  clientTimeZone,
  failureHandler,
  notificationDeps,
  RETRIES,
  sendClientPortalNotice,
} from '@/modules/commercial/server';
import { nextAllowedSendTime } from '@/modules/email';
import { billingIssueDeps } from '@/modules/billing/server';
import { inngest } from '@/modules/events';
import { withSystemContext, withUserContext } from '@/platform/db';
import { pendingAlerts } from './alerts';
import { sweepRetainerBilling } from './billing';
import { lisbonDay } from './domain/months';
import { sweepRetainerReviews } from './review';

const { clients, retainerExtraRequests } = schema;

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

const contexts = { withSystemContext, withUserContext };

async function clientName(clientId: string): Promise<string> {
  const [client] = await withSystemContext((tx) =>
    tx.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)),
  );
  return client?.name ?? '';
}

const roomUrl = (clientId: string) =>
  new URL(`/c/${clientId}/retainer`, notificationDeps().appBaseUrl).toString();

/**
 * AUT-22: a limit reaching 80% and then 100% of the month alerts the client's decision maker,
 * after their quiet hours, and the team, once per kind, month and threshold.
 */
const usageAlerts = inngest.createFunction(
  {
    id: 'retainers-usage-alerts',
    triggers: [{ event: 'retainers.usage.recorded' }],
    retries: RETRIES,
    onFailure: failureHandler('retainers-usage-alerts'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{ retainerId: string; month: string }>;
    const clientId = data.clientId;
    if (!clientId) return { alerts: 0 };
    const alerts = await step.run('record-alerts', () =>
      pendingAlerts(data.payload.retainerId, data.payload.month, { contexts }),
    );
    if (alerts.length === 0) return { alerts: 0 };
    await step.run('alert-team', async () => {
      const companyName = await clientName(clientId);
      for (const alert of alerts) {
        await alertClientTeam(
          data.organizationId,
          clientId,
          'founder.retainer_threshold',
          { companyName, kind: alert.kind, percent: alert.percent, roomUrl: roomUrl(clientId) },
          notificationDeps(),
        );
      }
    });
    const sendAt = await step.run('quiet-hours-send-time', async () =>
      nextAllowedSendTime(
        new Date(),
        await clientTimeZone(clientId, notificationDeps()),
      ).toISOString(),
    );
    await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
    await step.run('alert-client', () =>
      sendClientPortalNotice(clientId, 'lead.retainer_threshold', notificationDeps(), {
        path: '/progress',
      }),
    );
    return { alerts: alerts.length };
  },
);

/** AUT-23: a request above the limit asks the team for a quote. */
const extraRequested = inngest.createFunction(
  {
    id: 'retainers-extra-requested',
    triggers: [{ event: 'retainers.extra.requested' }],
    retries: RETRIES,
    onFailure: failureHandler('retainers-extra-requested'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{ extraRequestId: string }>;
    const clientId = data.clientId;
    if (!clientId) return { sent: 0 };
    const sent = await step.run('alert-team', async () => {
      const [extra] = await withSystemContext((tx) =>
        tx
          .select({ description: retainerExtraRequests.description })
          .from(retainerExtraRequests)
          .where(eq(retainerExtraRequests.id, data.payload.extraRequestId)),
      );
      if (!extra) return 0;
      return alertClientTeam(
        data.organizationId,
        clientId,
        'founder.retainer_extra_requested',
        {
          companyName: await clientName(clientId),
          description: extra.description,
          roomUrl: roomUrl(clientId),
        },
        notificationDeps(),
      );
    });
    return { sent };
  },
);

/** AUT-24: every morning, retainers 60 days from their review get the review task. */
const reviewSweep = inngest.createFunction(
  {
    id: 'retainers-review-sweep',
    triggers: [{ cron: 'TZ=Europe/Lisbon 0 8 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('retainers-review-sweep'),
  },
  async ({ step }) => {
    const created = await step.run('sweep-reviews', () =>
      sweepRetainerReviews(lisbonDay(new Date()), { contexts }),
    );
    return { created };
  },
);

/** 3B.2: every morning, each active retainer's month and each approved extra still to bill. */
const billingSweep = inngest.createFunction(
  {
    id: 'retainers-billing',
    triggers: [{ cron: 'TZ=Europe/Lisbon 0 7 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('retainers-billing'),
  },
  async ({ step }) => {
    const issued = await step.run('sweep-billing', () =>
      sweepRetainerBilling({ contexts, billing: billingIssueDeps() }),
    );
    return { issued };
  },
);

export const RETAINER_FUNCTIONS = [usageAlerts, extraRequested, reviewSweep, billingSweep];
