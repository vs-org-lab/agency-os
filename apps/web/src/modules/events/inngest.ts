import { Inngest } from 'inngest';
import { withSystemContext } from '@/platform/db';
import { createOutboxDispatcher, type DispatchResult, type OutboxFailure } from './dispatch';

export const inngest = new Inngest({ id: 'agency-os' });

export const OUTBOX_FLUSH_EVENT = 'outbox/flush';

function reportOutboxFailure(failure: OutboxFailure): void {
  console.error(JSON.stringify({ level: 'error', message: 'outbox.event_failed', ...failure }));
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

export async function requestFlush(): Promise<void> {
  try {
    await inngest.send({ name: OUTBOX_FLUSH_EVENT, data: {} });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'warn',
        message: 'outbox.flush_request_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
