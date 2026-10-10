import 'server-only';
import {
  alertFounders,
  failureHandler,
  notificationDeps,
  RETRIES,
} from '@/modules/commercial/server';
import { inngest } from '@/modules/events';
import { withSystemContext } from '@/platform/db';
import { testimonialNotice } from './notices';

/** A new or replaced testimonial reaches the founders with what the client wrote. */
const testimonialReceived = inngest.createFunction(
  {
    id: 'testimonials-received-notice',
    triggers: [{ event: 'testimonials.received' }],
    retries: RETRIES,
    onFailure: failureHandler('testimonials-received-notice'),
  },
  async ({ event, step }) => {
    const { testimonialId } = (event.data as { payload: { testimonialId?: string } }).payload;
    if (!testimonialId) return { sent: 0 };
    const sent = await step.run('alert-founders', async () => {
      const deps = notificationDeps();
      const notice = await testimonialNotice(testimonialId, {
        contexts: { withSystemContext },
        appBaseUrl: deps.appBaseUrl,
      });
      if (!notice) return 0;
      return alertFounders(
        notice.organizationId,
        'founder.testimonial_received',
        notice.params,
        deps,
      );
    });
    return { sent };
  },
);

export const TESTIMONIAL_FUNCTIONS = [testimonialReceived];
