import 'server-only';
import { failureHandler, hostCalendar, RETRIES } from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext, withUserContext } from '@/platform/db';
import { syncMeeting } from './sync';

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

/** A scheduled, changed or cancelled meeting reaches the host's Google Calendar. */
const meetingSync = inngest.createFunction(
  {
    id: 'agenda-meeting-sync',
    triggers: [{ event: 'agenda.meeting.changed' }],
    retries: RETRIES,
    onFailure: failureHandler('agenda-meeting-sync'),
  },
  async ({ event, step }) => {
    const { eventId } = (event.data as EventData<{ eventId?: string }>).payload;
    if (!eventId) return { sync: 'skipped' };
    const sync = await step.run('sync-meeting', () =>
      syncMeeting(eventId, {
        contexts: { withUserContext, withSystemContext },
        calendar: hostCalendar,
      }),
    );
    return { sync };
  },
);

export const AGENDA_FUNCTIONS = [meetingSync];
