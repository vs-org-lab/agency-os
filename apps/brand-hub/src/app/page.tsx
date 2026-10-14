'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@agency-os/i18n/messages/pt-PT';
import { createSiteApi } from '../site/api';
import { HubSite } from '../site/hub-site';

const SITE_MESSAGES = { brandHub: messages.brandHub };

const subscribe = () => () => undefined;

/** The one page of the static site; every path is rewritten here and the hub is read in the browser. */
export default function BrandHubPage() {
  const href = useSyncExternalStore(
    subscribe,
    () => window.location.href,
    () => null,
  );
  const api = useMemo(() => {
    const osUrl = process.env.NEXT_PUBLIC_OS_URL ?? '';
    return createSiteApi(osUrl, fetch, process.env.NEXT_PUBLIC_OS_PAGES_URL || osUrl);
  }, []);
  if (href === null) return null;
  return (
    <NextIntlClientProvider locale="pt-PT" messages={SITE_MESSAGES} timeZone="Europe/Lisbon">
      <HubSite
        api={api}
        siteHost={process.env.NEXT_PUBLIC_SITE_HOST ?? ''}
        location={new URL(href)}
        replaceHash={() =>
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${window.location.search}`,
          )
        }
      />
    </NextIntlClientProvider>
  );
}
