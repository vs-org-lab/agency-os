import 'server-only';
import { failureHandler, hostCalendar, RETRIES } from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext, withUserContext } from '@/platform/db';
import { retryFailedMeetings, syncMeeting } from './sync';

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

const syncDeps = () => ({
  contexts: { withUserContext, withSystemContext },
  calendar: hostCalendar,
});

/**
 * A scheduled, changed or cancelled meeting reaches the host's Google Calendar. Runs for the same
 * meeting never overlap, and a failed sync throws so the step is retried.
 */
const meetingSync = inngest.createFunction(
  {
    id: 'agenda-meeting-sync',
    triggers: [{ event: 'agenda.meeting.changed' }],
    retries: RETRIES,
    concurrency: [{ key: 'event.data.payload.eventId', limit: 1 }],
    onFailure: failureHandler('agenda-meeting-sync'),
  },
  async ({ event, step }) => {
    const { eventId } = (event.data as EventData<{ eventId?: string }>).payload;
    if (!eventId) return { sync: 'skipped' };
    const sync = await step.run('sync-meeting', async () => {
      const result = await syncMeeting(eventId, syncDeps());
      if (result === 'failed') throw new Error(`Agenda meeting ${eventId} did not sync`);
      return result;
    });
    return { sync };
  },
);

/** Hourly: meetings left failed by an outage, cancellations included, are tried again. */
const syncSweep = inngest.createFunction(
  {
    id: 'agenda-sync-sweep',
    triggers: [{ cron: 'TZ=Europe/Lisbon 50 * * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('agenda-sync-sweep'),
  },
  async ({ step }) => step.run('retry-failed-meetings', () => retryFailedMeetings(syncDeps())),
);

export const AGENDA_FUNCTIONS = [meetingSync, syncSweep];
