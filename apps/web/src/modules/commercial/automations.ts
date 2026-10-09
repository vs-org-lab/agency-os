import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import {
  ensureEngagementForCall,
  finishTranscription,
  markRecordingFailed,
  startTranscription,
  stepFailure,
  sweepExpiredRecordings,
  transcribeDeps,
  transcribeTrack,
} from '@/modules/diagnosis/server';
import { emailPort } from '@/modules/email/server';
import { inngest, type DomainEventType } from '@/modules/events';
import { withSystemContext } from '@/platform/db';
import { commercialEnv } from '@/platform/env';
import { logger } from '@/platform/logger';
import { alertNewApplication, remindPendingQueueB } from './applications/alerts';
import { anonymizeExpiredApplications } from './applications/anonymize';
import {
  alertFounders,
  callOutcomeMissing,
  clientTimeZone,
  leadTimeZoneForDeal,
  sendClientPortalNotice,
  sendPortalNotice,
  type PortalNoticeTemplate,
  sendBookingCancelled,
  sendBookingLinkEmail,
  sendCallConfirmation,
  sendCallReminder,
  type NotificationDeps,
} from './booking/notifications';
import { runCallBookedFlow } from './booking/call-flow';
import { syncPendingCall } from './booking/service';
import { hostCalendar } from './calendar/integration';
import { createDueFollowUps } from './follow-ups/sweep';
import { nextAllowedSendTime } from '@/modules/email';

const { applications } = schema;

export const RETRIES = 5;

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

export function notificationDeps(): NotificationDeps {
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

export function failureHandler(functionId: string) {
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
    const sendAt = await step.run('quiet-hours-send-time', () =>
      nextAllowedSendTime(new Date(), timeZone).toISOString(),
    );
    await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
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
    const deps = notificationDeps();
    return runCallBookedFlow(
      { callId: data.payload.callId, startsAt: new Date(data.payload.startsAt) },
      {
        run: (id, operation) => step.run(id, operation) as never,
        sleepUntil: async (id, at) => {
          await step.sleepUntil(id, at);
        },
      },
      {
        now: () => new Date(),
        ensureCore: async (callId) =>
          (await withSystemContext((tx) => ensureEngagementForCall(tx, callId))) !== null,
        syncCall: async (callId) => {
          const result = await syncPendingCall(callId, {
            contexts: { withSystemContext },
            calendar: hostCalendar,
          });
          if (result?.sync === 'failed') logger.warn('commercial.call_sync_failed', { callId });
          return result?.endsAt ?? null;
        },
        sendConfirmation: (callId) => sendCallConfirmation(callId, deps),
        sendReminder: (callId, startsAt) => sendCallReminder(callId, startsAt, deps),
        checkOutcome: (callId) => callOutcomeMissing(callId, deps),
      },
    );
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
    const data = event.data as EventData<{
      callId: string;
      notifyLead?: boolean;
      externalEventId?: string | null;
    }>;
    const { callId, notifyLead, externalEventId } = data.payload;
    if (externalEventId) {
      await step.run('delete-calendar-event', async () => {
        const host = await hostCalendar(data.organizationId);
        await host?.port.deleteEvent(externalEventId);
      });
    }
    if (notifyLead !== false) {
      await step.run('send-cancellation', () => sendBookingCancelled(callId, notificationDeps()));
    }
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

export function portalNoticeFunction(
  id: string,
  trigger: DomainEventType,
  template: PortalNoticeTemplate,
) {
  return inngest.createFunction(
    { id, triggers: [{ event: trigger }], retries: RETRIES, onFailure: failureHandler(id) },
    async ({ event, step }) => {
      const { dealId } = (event.data as EventData<{ dealId: string | null }>).payload;
      if (!dealId) return { sent: false };
      const sendAt = await step.run('quiet-hours-send-time', async () =>
        nextAllowedSendTime(
          new Date(),
          await leadTimeZoneForDeal(dealId, notificationDeps()),
        ).toISOString(),
      );
      await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
      const sent = await step.run('send-portal-notice', () =>
        sendPortalNotice(dealId, template, notificationDeps()),
      );
      return { sent };
    },
  );
}

/** Like portalNoticeFunction, for events about a client rather than a deal. */
export function clientPortalNoticeFunction(
  id: string,
  trigger: DomainEventType,
  template: PortalNoticeTemplate,
) {
  return inngest.createFunction(
    { id, triggers: [{ event: trigger }], retries: RETRIES, onFailure: failureHandler(id) },
    async ({ event, step }) => {
      const { clientId } = event.data as EventData<unknown>;
      if (!clientId) return { sent: false };
      const sendAt = await step.run('quiet-hours-send-time', async () =>
        nextAllowedSendTime(
          new Date(),
          await clientTimeZone(clientId, notificationDeps()),
        ).toISOString(),
      );
      await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
      const sent = await step.run('send-portal-notice', () =>
        sendClientPortalNotice(clientId, template, notificationDeps()),
      );
      return { sent };
    },
  );
}

export const onCoreBriefingShared = portalNoticeFunction(
  'core-briefing-shared',
  'core.briefing.shared',
  'lead.briefing_shared',
);

export const onCoreDocumentShared = portalNoticeFunction(
  'core-document-shared',
  'core.document.shared',
  'lead.presentation_shared',
);

const RECORDING_ERROR_CODES = ['file_too_large', 'rate_limited', 'provider_error'];

function recordingErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && RECORDING_ERROR_CODES.includes(code)
    ? code
    : 'transcription_failed';
}

export const onCoreRecordingUploaded = inngest.createFunction(
  {
    id: 'core-recording-transcribe',
    triggers: [{ event: 'core.recording.uploaded' }],
    retries: RETRIES,
    onFailure: async ({
      error,
      event,
    }: {
      error: unknown;
      event: { data: { event?: { data?: unknown } } };
    }) => {
      const original = event.data.event?.data as EventData<{ recordingId?: string }> | undefined;
      const recordingId = original?.payload.recordingId;
      if (recordingId) {
        await markRecordingFailed(recordingId, recordingErrorCode(error), {
          contexts: { withSystemContext },
        });
      }
      await reportFailure('core-recording-transcribe', original?.organizationId, error);
    },
  },
  async ({ event, step }) => {
    const { recordingId } = (event.data as EventData<{ recordingId: string }>).payload;
    const job = await step.run('start-transcription', () =>
      startTranscription(recordingId, transcribeDeps()),
    );
    if (!job) return { result: 'skipped' };
    const segments: Awaited<ReturnType<typeof transcribeTrack>>[] = [];
    for (let index = 0; index < job.tracks.length; index += 1) {
      segments.push(
        await step.run(`transcribe-track-${index}`, () =>
          transcribeTrack(job, index, transcribeDeps()).catch((error: unknown) => {
            throw stepFailure(error);
          }),
        ),
      );
    }
    const result = await step.run('finish-transcription', () =>
      finishTranscription(job, segments, transcribeDeps()),
    );
    return { result };
  },
);

export const recordingSweep = inngest.createFunction(
  {
    id: 'core-recording-sweep',
    triggers: [{ cron: 'TZ=Europe/Lisbon 45 3 * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('core-recording-sweep'),
  },
  async ({ step }) =>
    step.run('remove-expired-recordings', () => sweepExpiredRecordings(transcribeDeps())),
);

export const COMMERCIAL_FUNCTIONS = [
  onCoreRecordingUploaded,
  recordingSweep,
  onCoreBriefingShared,
  onCoreDocumentShared,
  onApplicationSubmitted,
  onApplicationReviewed,
  onCallBooked,
  onCallCancelled,
  onCalendarUnavailable,
  followUpSweep,
  anonymizationSweep,
];
