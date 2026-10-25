import * as Sentry from '@sentry/nextjs';
import { Inngest } from 'inngest';
import { logger } from '@/platform/logger';
import { withSystemContext } from '@/platform/db';
import { createOutboxDispatcher, type DispatchResult, type OutboxFailure } from './dispatch';
import { boundedFlushRequest } from './flush-request';

export const inngest = new Inngest({ id: 'agency-os' });

export const OUTBOX_FLUSH_EVENT = 'outbox/flush';

function reportOutboxFailure(failure: OutboxFailure): void {
  logger.error('outbox.event_failed', failure);
  Sentry.captureMessage('outbox.event_failed', {
    level: 'error',
    tags: { eventType: failure.type },
    extra: { eventId: failure.id, attempts: failure.attempts, error: failure.error },
  });
}

export function dispatchPending(): Promise<DispatchResult> {
  return createOutboxDispatcher({
    contexts: { withSystemContext },
    send: async (events) => {
      await inngest.send(
        events.map((event) => ({ id: event.id, name: event.name, data: event.data })),
      );
    },
    reportFailure: reportOutboxFailure,
  })();
}

export const outboxDispatch = inngest.createFunction(
  {
    id: 'outbox-dispatch',
    triggers: [{ cron: '*/5 * * * *' }, { event: OUTBOX_FLUSH_EVENT }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => step.run('dispatch-pending', () => dispatchPending()),
);

const FLUSH_REQUEST_TIMEOUT_MS = 2_000;

export function requestFlush(): Promise<void> {
  return boundedFlushRequest(
    async () => {
      await inngest.send({ name: OUTBOX_FLUSH_EVENT, data: {} });
    },
    FLUSH_REQUEST_TIMEOUT_MS,
    (error) => logger.warn('outbox.flush_request_failed', { error }),
  );
}
