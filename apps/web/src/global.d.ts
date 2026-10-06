import type { Locale } from '@agency-os/i18n';
import type messages from '@agency-os/i18n/messages/pt-PT';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
