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
import { withSystemContext } from '@/platform/db';
import { proofCommentNotice, roundsNoticeParams } from './notices';

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

/** A client comment reaches the client team; a team comment reaches the client unless internal. */
const commentNotice = inngest.createFunction(
  {
    id: 'proofing-comment-notice',
    triggers: [{ event: 'proofing.comment.added' }],
    retries: RETRIES,
    onFailure: failureHandler('proofing-comment-notice'),
  },
  async ({ event, step }) => {
    const { commentId } = (event.data as EventData<{ commentId?: string }>).payload;
    if (!commentId) return { sent: false };
    const notice = await step.run('read-comment', () =>
      proofCommentNotice(commentId, {
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
          'founder.proof_comment',
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
      sendClientPortalNotice(notice.clientId, 'lead.proof_comment', notificationDeps()),
    );
    return { sent };
  },
);

type RoundsPayload = { used?: number; limit?: number };

/** AUT-17: at 80% of the revision rounds the client team and the decision maker are told. */
const roundsWarning = inngest.createFunction(
  {
    id: 'proofing-rounds-warning',
    triggers: [{ event: 'proofing.rounds.warning' }],
    retries: RETRIES,
    onFailure: failureHandler('proofing-rounds-warning'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<RoundsPayload>;
    const clientId = data.clientId;
    if (!clientId) return { sent: false };
    await step.run('alert-client-team', async () => {
      const params = await roundsNoticeParams(clientId, {
        contexts: { withSystemContext },
        appBaseUrl: notificationDeps().appBaseUrl,
      });
      if (!params) return 0;
      return alertClientTeam(
        data.organizationId,
        clientId,
        'founder.rounds_warning',
        { ...params, used: data.payload.used ?? 0, limit: data.payload.limit ?? 0 },
        notificationDeps(),
      );
    });
    const sendAt = await step.run('quiet-hours-send-time', async () =>
      nextAllowedSendTime(
        new Date(),
        await clientTimeZone(clientId, notificationDeps()),
      ).toISOString(),
    );
    await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
    const sent = await step.run('send-portal-notice', () =>
      sendClientPortalNotice(clientId, 'lead.rounds_warning', notificationDeps()),
    );
    return { sent };
  },
);

/** RN-42: a round past the limit alerts the client team, who quote it. */
const extraRound = inngest.createFunction(
  {
    id: 'proofing-extra-round',
    triggers: [{ event: 'proofing.round.extra' }],
    retries: RETRIES,
    onFailure: failureHandler('proofing-extra-round'),
  },
  async ({ event, step }) => {
    const data = event.data as EventData<RoundsPayload>;
    const clientId = data.clientId;
    if (!clientId) return { sent: 0 };
    const sent = await step.run('alert-client-team', async () => {
      const params = await roundsNoticeParams(clientId, {
        contexts: { withSystemContext },
        appBaseUrl: notificationDeps().appBaseUrl,
      });
      if (!params) return 0;
      return alertClientTeam(
        data.organizationId,
        clientId,
        'founder.extra_round',
        { ...params, used: data.payload.used ?? 0, limit: data.payload.limit ?? 0 },
        notificationDeps(),
      );
    });
    return { sent };
  },
);

export const PROOFING_FUNCTIONS = [commentNotice, roundsWarning, extraRound];
