import 'server-only';
import {
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
import { sweepHubAssets } from './assets';

type EventData<P> = { organizationId: string; clientId: string | null; payload: P };

/** A new publication reaches the client with a link to the hub, after their quiet hours. */
const publishedNotice = inngest.createFunction(
  {
    id: 'brand-hub-published-notice',
    triggers: [{ event: 'brand_hub.published' }],
    retries: RETRIES,
    onFailure: failureHandler('brand-hub-published-notice'),
  },
  async ({ event, step }) => {
    const clientId = (event.data as EventData<{ publicationId?: string }>).clientId;
    if (!clientId) return { sent: false };
    const sendAt = await step.run('quiet-hours-send-time', async () =>
      nextAllowedSendTime(
        new Date(),
        await clientTimeZone(clientId, notificationDeps()),
      ).toISOString(),
    );
    await step.sleepUntil('respect-quiet-hours', new Date(sendAt));
    const sent = await step.run('send-portal-notice', () =>
      sendClientPortalNotice(clientId, 'lead.brand_hub_published', notificationDeps(), {
        path: '/hub',
      }),
    );
    return { sent };
  },
);

/** Hourly: abandoned hub uploads close and removed assets no publication lists are deleted. */
const assetSweep = inngest.createFunction(
  {
    id: 'brand-hub-asset-sweep',
    triggers: [{ cron: 'TZ=Europe/Lisbon 40 * * * *' }],
    retries: RETRIES,
    onFailure: failureHandler('brand-hub-asset-sweep'),
  },
  async ({ step }) =>
    step.run('sweep-hub-assets', () =>
      sweepHubAssets({
        contexts: { withUserContext, withSystemContext },
        storage: createSupabaseLibraryStorage(),
      }),
    ),
);

export const BRAND_HUB_FUNCTIONS = [publishedNotice, assetSweep];
