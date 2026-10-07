import type { EmailTemplateKey } from './templates';

export type OutgoingEmail = {
  to: string;
  template: EmailTemplateKey;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  organizationId: string | null;
};

export type EmailPort = {
  send(message: OutgoingEmail): Promise<void>;
};
