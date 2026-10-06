import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';
import createNextIntlPlugin from 'next-intl/plugin';

loadEnvConfig(
  path.resolve(import.meta.dirname, '../..'),
  process.env.NODE_ENV !== 'production',
  { info: () => undefined, error: console.error },
  true,
);

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@agency-os/ui', '@agency-os/i18n', '@agency-os/db'],
  serverExternalPackages: ['postgres'],
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG ?? 'aurion-j4',
  project: process.env.SENTRY_PROJECT ?? 'javascript-nextjs',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  tunnelRoute: '/monitoring',
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  telemetry: false,
});
