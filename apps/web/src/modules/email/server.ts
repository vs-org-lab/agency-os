import 'server-only';
import { withSystemContext } from '@/platform/db';
import { emailEnv } from '@/platform/env';
import { createCaptureEmailPort } from './capture';
import type { EmailPort } from './port';
import { createSmtpEmailPort } from './smtp';

let cachedPort: EmailPort | undefined;

export function emailPort(): EmailPort {
  if (cachedPort) return cachedPort;
  const env = emailEnv();
  cachedPort =
    env.EMAIL_TRANSPORT === 'smtp'
      ? createSmtpEmailPort({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
        })
      : createCaptureEmailPort({ withSystemContext });
  return cachedPort;
}
