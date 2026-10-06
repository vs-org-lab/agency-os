import { defineRouting } from 'next-intl/routing';
import { defaultLocale, locales } from '@agency-os/i18n';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
});
