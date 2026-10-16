import 'server-only';
import { RETRIES, failureHandler } from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext } from '@/platform/db';
import { lisbonDay } from './access';
import { sweepReportDrafts } from './drafts';

/** AUT-25: on the first of each month, report drafts and, at a quarter's close, the QBR. */
const reportDrafts = inngest.createFunction(
  {
    id: 'client-reports-drafts',
    triggers: [{ cron: 'TZ=Europe/Lisbon 0 8 1 * *' }],
    retries: RETRIES,
    onFailure: failureHandler('client-reports-drafts'),
  },
  async ({ step }) =>
    step.run('draft-reports', () =>
      sweepReportDrafts(lisbonDay(new Date()), { contexts: { withSystemContext } }),
    ),
);

export const CLIENT_REPORT_FUNCTIONS = [reportDrafts];
