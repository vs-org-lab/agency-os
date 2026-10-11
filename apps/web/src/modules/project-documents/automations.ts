import 'server-only';
import {
  alertClientTeam,
  clientTimeZone,
  failureHandler,
  notificationDeps,
  RETRIES,
  sendClientPortalNotice,
} from '@/modules/commercial/server';
import { nextAllowedSendTime } from '@/modules/email';
import { inngest } from '@/modules/events';
import { createSupabaseLibraryStorage } from '@/modules/library/server';
import { withSystemContext, withUserContext } from '@/platform/db';
import { documentCommentNotice } from './notices';
import { sweepStaleDocumentUploads } from './versions';

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

/** A shared document reaches the client with a link to open it. */
const sharedNotice = inngest.createFunction(
  {
    id: 'documents-shared-notice',
    triggers: [{ event: 'rooms.document.shared' }],
    retries: RETRIES,
    onFailure: failureHandler('documents-shared-notice'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<{ documentId?: string }>;
    const { documentId } = data.payload;
    const clientId = data.clientId;
    if (!documentId || !clientId) return { sent: false };
    const sendAt = await step.run('quiet-hours-send-time', async () =>
      nextAllowedSendTime(
        new Date(),
        await clientTimeZone(clientId, notificationDeps()),
      ).toISOString(),
    );
    await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
    const sent = await step.run('send-portal-notice', () =>
      sendClientPortalNotice(clientId, 'lead.document_shared', notificationDeps(), {
        path: `/docs/${documentId}`,
      }),
    );
    return { sent };
  },
);

/** A client comment reaches the client team; a team comment reaches the client unless internal. */
const commentNotice = inngest.createFunction(
  {
    id: 'documents-comment-notice',
    triggers: [{ event: 'rooms.document.commented' }],
    retries: RETRIES,
    onFailure: failureHandler('documents-comment-notice'),
  },
  async ({ event, step }) => {
    const { commentId } = (event.data as EventData<{ commentId?: string }>).payload;
    if (!commentId) return { sent: false };
    const notice = await step.run('read-comment', () =>
      documentCommentNotice(commentId, {
        contexts: { withSystemContext },
        appBaseUrl: notificationDeps().appBaseUrl,
      }),
    );
    if (!notice) return { sent: false };
    if (notice.audience === 'team') {
      const sent = await step.run('alert-client-team', () =>
        alertClientTeam(
          notice.organizationId,
          notice.clientId,
          'founder.document_comment',
          notice.params,
          notificationDeps(),
        ),
      );
      return { sent: sent > 0 };
    }
    const sendAt = await step.run('quiet-hours-send-time', async () =>
      nextAllowedSendTime(
        new Date(),
        await clientTimeZone(notice.clientId, notificationDeps()),
      ).toISOString(),
    );
    await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
    const sent = await step.run('send-portal-notice', () =>
      sendClientPortalNotice(notice.clientId, 'lead.document_comment', notificationDeps(), {
        path: `/docs/${notice.documentId}`,
      }),
    );
    return { sent };
  },
);

/** Hourly: document uploads never confirmed after their link expired give their storage back. */
const staleUploads = inngest.createFunction(
  {
    id: 'documents-stale-uploads',
    triggers: [{ cron: 'TZ=Europe/Lisbon 20 * * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('documents-stale-uploads'),
  },
  async ({ step }) =>
    step.run('sweep-stale-uploads', () =>
      sweepStaleDocumentUploads({
        contexts: { withUserContext, withSystemContext },
        storage: createSupabaseLibraryStorage(),
      }),
    ),
);

export const DOCUMENT_FUNCTIONS = [sharedNotice, commentNotice, staleUploads];
