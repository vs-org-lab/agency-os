import { describe, expect, it } from 'vitest';
import { createSmtpEmailPort, type MailTransport } from './smtp';

describe('createSmtpEmailPort', () => {
  it('maps the message to nodemailer options with the sender name', async () => {
    const sent: unknown[] = [];
    const transport: MailTransport = {
      sendMail: async (options) => {
        sent.push(options);
        return {};
      },
    };
    const port = createSmtpEmailPort(
      { host: 'smtp.example.com', port: 465, user: 'studio@example.com', password: 'secret' },
      () => transport,
    );

    await port.send({
      to: 'ana@empresa.pt',
      template: 'lead.booking_link',
      subject: 'A sua chamada',
      html: '<html></html>',
      text: 'Texto',
      fromName: 'Vladimir, Aurion',
      organizationId: null,
    });

    expect(sent).toEqual([
      {
        from: { name: 'Vladimir, Aurion', address: 'studio@example.com' },
        to: 'ana@empresa.pt',
        subject: 'A sua chamada',
        html: '<html></html>',
        text: 'Texto',
      },
    ]);
  });
});
