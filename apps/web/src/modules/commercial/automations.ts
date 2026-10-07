import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { emailPort } from '@/modules/email/server';
import { inngest } from '@/modules/events';
import { withSystemContext } from '@/platform/db';
import { commercialEnv } from '@/platform/env';
import { logger } from '@/platform/logger';
import { alertNewApplication, remindPendingQueueB } from './applications/alerts';
import { anonymizeExpiredApplications } from './applications/anonymize';
import {
  alertFounders,
  callOutcomeMissing,
  sendBookingCancelled,
  sendBookingLinkEmail,
  sendCallConfirmation,
  sendCallReminder,
  type NotificationDeps,
} from './booking/notifications';
import { syncCallEvent } from './booking/service';
import { hostCalendar } from './calendar/integration';
import { createDueFollowUps } from './follow-ups/sweep';
import { nextAllowedSendTime } from '@/modules/email';

const { applications, calls } = schema;

const RETRIES = 5;
const HOUR_MS = 60 * 60 * 1000;

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

function notificationDeps(): NotificationDeps {
  const env = commercialEnv();
  return {
    contexts: { withSystemContext },
    email: emailPort(),
    appBaseUrl: env.APP_BASE_URL,
    linkSecret: env.PUBLIC_LINK_SECRET,
    now: () => new Date(),
  };
}

async function reportFailure(
  functionId: string,
  organizationId: string | undefined,
  error: unknown,
) {
  logger.error('commercial.automation_failed', { functionId, error });
  Sentry.captureException(error, { tags: { automation: functionId } });
  if (!organizationId) return;
  const deps = notificationDeps();
  await alertFounders(
    organizationId,
    'founder.automation_failed',
    {
      automation: functionId,
      occurredAt: new Date().toISOString(),
      appUrl: new URL('/', deps.appBaseUrl).toString(),
    },
    deps,
  );
}

function failureHandler(functionId: string) {
  return async ({
    error,
    event,
  }: {
    error: unknown;
    event: { data: { event?: { data?: unknown } } };
  }) => {
    const original = event.data.event?.data as { organizationId?: string } | undefined;
    await reportFailure(functionId, original?.organizationId, error);
  };
}

function future(date: Date): boolean {
  return date.getTime() > Date.now();
}

export const onApplicationSubmitted = inngest.createFunction(
  {
    id: 'commercial-application-submitted',
    triggers: [{ event: 'commercial.application.submitted' }],
    retries: RETRIES,
    onFailure: failureHandler('commercial-application-submitted'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{ applicationId: string; dealId: string; path: string }>;
    const { applicationId, dealId, path } = data.payload;
    if (path === 'c') return { skipped: true };

    if (path === 'a') {
      await step.run('send-booking-link', () => sendBookingLinkEmail(dealId, notificationDeps()));
    }
    await step.run('alert-founders', () => alertNewApplication(applicationId, notificationDeps()));
    if (path === 'b') {
      await step.sleep('wait-for-queue-b-review', '24h');
      await step.run('remind-queue-b', () =>
        remindPendingQueueB(applicationId, notificationDeps()),
      );
    }
    return { skipped: false };
  },
);

export const onApplicationReviewed = inngest.createFunction(
  {
    id: 'commercial-application-reviewed',
    triggers: [{ event: 'commercial.application.reviewed' }],
    retries: RETRIES,
    onFailure: failureHandler('commercial-application-reviewed'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{
      applicationId: string;
      dealId: string;
      decision: string;
    }>;
    if (data.payload.decision !== 'a') return { skipped: true };

    const timeZone = await step.run('lead-time-zone', async () => {
      const [row] = await withSystemContext((tx) =>
        tx
          .select({ source: applications.source })
          .from(applications)
          .where(eq(applications.id, data.payload.applicationId)),
      );
      return (row?.source as { timeZone?: string } | undefined)?.timeZone ?? 'Europe/Lisbon';
    });
    const sendAt = nextAllowedSendTime(new Date(), timeZone);
    if (future(sendAt)) await step.sleepUntil('respect-quiet-hours', sendAt);
    await step.run('send-booking-link', () =>
      sendBookingLinkEmail(data.payload.dealId, notificationDeps()),
    );
    return { skipped: false };
  },
);

export const onCallBooked = inngest.createFunction(
  {
    id: 'commercial-call-booked',
    triggers: [{ event: 'commercial.call.booked' }, { event: 'commercial.call.rescheduled' }],
    retries: RETRIES,
    cancelOn: [
      {
        event: 'commercial.call.rescheduled',
        if: 'async.data.payload.callId == event.data.payload.callId',
      },
      {
        event: 'commercial.call.cancelled',
        if: 'async.data.payload.callId == event.data.payload.callId',
      },
    ],
    onFailure: failureHandler('commercial-call-booked'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{ callId: string; startsAt: string }>;
    const { callId } = data.payload;
    const startsAt = new Date(data.payload.startsAt);

    const endsAt = await step.run('sync-calendar-event', async () => {
      const [call] = await withSystemContext((tx) =>
        tx
          .select({ syncStatus: calls.syncStatus, endsAt: calls.endsAt })
          .from(calls)
          .where(eq(calls.id, callId)),
      );
      if (!call) return null;
      if (call.syncStatus !== 'synced') {
        const host = await hostCalendar(data.organizationId);
        if (host) await syncCallEvent(callId, host.port, { withSystemContext });
      }
      return call.endsAt.toISOString();
    });
    if (!endsAt) return { skipped: true };

    await step.run('send-confirmation', () => sendCallConfirmation(callId, notificationDeps()));

    const dayBefore = new Date(startsAt.getTime() - 24 * HOUR_MS);
    if (future(dayBefore)) {
      await step.sleepUntil('wait-day-before', dayBefore);
      await step.run('remind-day-before', () =>
        sendCallReminder(callId, startsAt, notificationDeps()),
      );
    }
    const hourBefore = new Date(startsAt.getTime() - HOUR_MS);
    if (future(hourBefore)) {
      await step.sleepUntil('wait-hour-before', hourBefore);
      await step.run('remind-hour-before', () =>
        sendCallReminder(callId, startsAt, notificationDeps()),
      );
    }
    await step.sleepUntil('wait-for-outcome', new Date(new Date(endsAt).getTime() + 2 * HOUR_MS));
    await step.run('check-outcome', () => callOutcomeMissing(callId, notificationDeps()));
    return { skipped: false };
  },
);

export const onCallCancelled = inngest.createFunction(
  {
    id: 'commercial-call-cancelled',
    triggers: [{ event: 'commercial.call.cancelled' }],
    retries: RETRIES,
    onFailure: failureHandler('commercial-call-cancelled'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{ callId: string }>;
    await step.run('send-cancellation', () =>
      sendBookingCancelled(data.payload.callId, notificationDeps()),
    );
  },
);

export const onCalendarUnavailable = inngest.createFunction(
  {
    id: 'commercial-calendar-unavailable',
    triggers: [{ event: 'commercial.calendar.unavailable' }],
    retries: RETRIES,
    rateLimit: { key: 'event.data.organizationId', limit: 1, period: '24h' },
    onFailure: failureHandler('commercial-calendar-unavailable'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<unknown>;
    await step.run('alert-founders', () => {
      const deps = notificationDeps();
      return alertFounders(
        data.organizationId,
        'founder.integration_unavailable',
        {
          integration: 'Google Calendar',
          settingsUrl: new URL('/settings/integrations', deps.appBaseUrl).toString(),
        },
        deps,
      );
    });
  },
);

export const followUpSweep = inngest.createFunction(
  {
    id: 'commercial-follow-up-sweep',
    triggers: [{ cron: 'TZ=Europe/Lisbon 0 8 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('commercial-follow-up-sweep'),
  },
  async ({ step }) =>
    step.run('create-due-follow-ups', () =>
      createDueFollowUps(new Date(), { contexts: { withSystemContext } }),
    ),
);

export const anonymizationSweep = inngest.createFunction(
  {
    id: 'commercial-anonymization-sweep',
    triggers: [{ cron: 'TZ=Europe/Lisbon 30 3 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('commercial-anonymization-sweep'),
  },
  async ({ step }) =>
    step.run('anonymize-expired-applications', () =>
      anonymizeExpiredApplications(new Date(), { contexts: { withSystemContext } }),
    ),
);

export const COMMERCIAL_FUNCTIONS = [
  onApplicationSubmitted,
  onApplicationReviewed,
  onCallBooked,
  onCallCancelled,
  onCalendarUnavailable,
  followUpSweep,
  anonymizationSweep,
];
