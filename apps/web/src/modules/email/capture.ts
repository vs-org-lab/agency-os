import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';
import type { EmailPort } from './port';

const { capturedEmails } = schema;

export function createCaptureEmailPort(contexts: Pick<DbContexts, 'withSystemContext'>): EmailPort {
  return {
    async send(message) {
      await contexts.withSystemContext(async (tx) => {
        await tx.insert(capturedEmails).values({
          organizationId: message.organizationId,
          recipient: message.to,
          template: message.template,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
      });
    },
  };
}
