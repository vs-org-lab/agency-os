import 'server-only';
import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import {
  alertClientTeam,
  failureHandler,
  notificationDeps,
  RETRIES,
} from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext, withUserContext } from '@/platform/db';
import { lisbonDay } from './access';
import { sweepRenewals } from './renewals';
import { sweepHealthSnapshots } from './snapshots';

const { clients } = schema;

const contexts = { withSystemContext, withUserContext };

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

/** AUT-29: every morning, a year of partnership brings the renewal box task. */
const renewalSweep = inngest.createFunction(
  {
    id: 'milestones-renewal-sweep',
    triggers: [{ cron: 'TZ=Europe/Lisbon 15 8 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('milestones-renewal-sweep'),
  },
  async ({ step }) => {
    const created = await step.run('sweep-renewals', () =>
      sweepRenewals(lisbonDay(new Date()), { contexts }),
    );
    return { created };
  },
);

/** Every morning, each active client's health is kept for its trend (spec 3E.1 §3.5). */
const healthSnapshots = inngest.createFunction(
  {
    id: 'health-snapshots',
    triggers: [{ cron: 'TZ=Europe/Lisbon 30 7 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('health-snapshots'),
  },
  async ({ step }) =>
    step.run('snapshot-health', () => sweepHealthSnapshots(new Date(), { contexts })),
);

/** A client entering "at risk" tells the founders and the client's managers (spec 3E.1 §3.6). */
const healthAtRisk = inngest.createFunction(
  {
    id: 'health-at-risk',
    triggers: [{ event: 'health.client.at_risk' }],
    retries: RETRIES,
    onFailure: failureHandler('health-at-risk'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{ score: number }>;
    const clientId = data.clientId;
    if (!clientId) return { sent: 0 };
    const sent = await step.run('alert-team', async () => {
      const [client] = await withSystemContext((tx) =>
        tx.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)),
      );
      if (!client) return 0;
      const deps = notificationDeps();
      return alertClientTeam(
        data.organizationId,
        clientId,
        'founder.health_at_risk',
        {
          companyName: client.name,
          score: data.payload.score,
          roomUrl: new URL(`/c/${clientId}`, deps.appBaseUrl).toString(),
        },
        deps,
      );
    });
    return { sent };
  },
);

export const MILESTONE_FUNCTIONS = [renewalSweep];
export const HEALTH_FUNCTIONS = [healthSnapshots, healthAtRisk];
