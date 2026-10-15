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
import type { GuaranteeDecision } from './guarantee';
import { sweepOutcomes } from './sweep';

const { clients, projectOutcomes } = schema;

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

const contexts = { withSystemContext, withUserContext };

/** AUT-26: every morning, outcomes past their deadline and active guarantees are decided. */
const outcomesSweep = inngest.createFunction(
  {
    id: 'outcomes-sweep',
    triggers: [{ cron: 'TZ=Europe/Lisbon 30 6 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('outcomes-sweep'),
  },
  async ({ step }) => {
    const result = await step.run('sweep-outcomes', () =>
      sweepOutcomes(lisbonDay(new Date()), { contexts }),
    );
    return result;
  },
);

/** Each guarantee decision tells the founders and the client's managers (spec 3C §2.7). */
const guaranteeDecided = inngest.createFunction(
  {
    id: 'outcomes-guarantee-decided',
    triggers: [{ event: 'outcomes.guarantee.decided' }],
    retries: RETRIES,
    onFailure: failureHandler('outcomes-guarantee-decided'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{
      outcomeId: string;
      status: GuaranteeDecision['status'];
      reason: GuaranteeDecision['reason'];
    }>;
    const clientId = data.clientId;
    if (!clientId) return { sent: 0 };
    const sent = await step.run('alert-team', async () => {
      const [outcome] = await withSystemContext((tx) =>
        tx
          .select({ metric: projectOutcomes.metric, companyName: clients.name })
          .from(projectOutcomes)
          .innerJoin(clients, eq(clients.id, projectOutcomes.clientId))
          .where(eq(projectOutcomes.id, data.payload.outcomeId)),
      );
      if (!outcome) return 0;
      const deps = notificationDeps();
      return alertClientTeam(
        data.organizationId,
        clientId,
        'founder.outcome_guarantee',
        {
          companyName: outcome.companyName,
          metric: outcome.metric,
          status: data.payload.status,
          reason: data.payload.reason ?? 'none',
          outcomeUrl: new URL(`/c/${clientId}/outcome`, deps.appBaseUrl).toString(),
        },
        deps,
      );
    });
    return { sent };
  },
);

export const OUTCOME_FUNCTIONS = [outcomesSweep, guaranteeDecided];
