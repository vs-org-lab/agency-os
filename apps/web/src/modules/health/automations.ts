import 'server-only';
import { failureHandler, RETRIES } from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext, withUserContext } from '@/platform/db';
import { lisbonDay } from './access';
import { sweepRenewals } from './renewals';

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
      sweepRenewals(lisbonDay(new Date()), { contexts: { withSystemContext, withUserContext } }),
    );
    return { created };
  },
);

export const MILESTONE_FUNCTIONS = [renewalSweep];
