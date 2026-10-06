import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

loadEnvConfig(path.resolve(import.meta.dirname, '../..'));

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@agency-os/ui', '@agency-os/i18n', '@agency-os/db'],
  serverExternalPackages: ['postgres'],
};

export default withNextIntl(nextConfig);
