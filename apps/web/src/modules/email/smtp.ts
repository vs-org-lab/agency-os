import nodemailer from 'nodemailer';
import type { EmailPort } from './port';

export type SmtpConfig = { host: string; port: number; user: string; password: string };

export type MailTransport = {
  sendMail(options: {
    from: { name: string; address: string };
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
};

function defaultTransport(config: SmtpConfig): MailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
}

export function createSmtpEmailPort(
  config: SmtpConfig,
  createTransport: (config: SmtpConfig) => MailTransport = defaultTransport,
): EmailPort {
  const transport = createTransport(config);
  return {
    async send(message) {
      await transport.sendMail({
        from: { name: message.fromName, address: config.user },
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    },
  };
}
