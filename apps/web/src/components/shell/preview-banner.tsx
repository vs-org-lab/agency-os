'use client';

import { Eye } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import { cn } from '@agency-os/ui/lib/utils';
import { usePathname } from '@/i18n/navigation';
import { localizedPath } from './portal-preview-path';

const ROLES = ['decision_maker', 'operational', 'client_finance'] as const;

/**
 * Shown on every portal screen while the team previews it as the client: who is being previewed,
 * as which role (switching keeps the screen) and the way out. Both are full navigations, since
 * they change the whole frame.
 */
export function PreviewBanner({
  clientId,
  clientName,
  role,
}: {
  clientId: string;
  clientName: string;
  role: (typeof ROLES)[number];
}) {
  const t = useTranslations('shell.clientPreview');
  const locale = useLocale() as Locale;
  const pathname = usePathname();

  return (
    <aside
      aria-label={t('label')}
      className="flex flex-wrap items-center justify-between gap-3 border-b border-info/40 bg-info-bg px-4 py-2.5 md:px-6 xl:px-8"
    >
      <p className="flex items-center gap-2 text-body-sm text-text">
        <Eye aria-hidden="true" className="size-4 shrink-0 text-info" />
        {t('notice', { client: clientName })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label={t('roleLabel')}
          className="flex rounded-md border border-border-strong p-0.5"
        >
          {ROLES.map((option) => (
            <a
              key={option}
              href={localizedPath(
                locale,
                `/c/${clientId}/preview?${new URLSearchParams({ role: option, to: pathname })}`,
              )}
              aria-current={option === role ? 'true' : undefined}
              className={cn(
                'rounded-sm px-2.5 py-1 text-caption font-medium transition-colors duration-(--duration-fast)',
                option === role ? 'bg-surface text-text' : 'text-text-secondary hover:text-text',
              )}
            >
              {t(`roles.${option}`)}
            </a>
          ))}
        </nav>
        <a
          href={localizedPath(locale, '/portal/preview-exit')}
          className="rounded-md border border-border-strong bg-surface px-3 py-1 text-body-sm font-medium text-text transition-colors duration-(--duration-fast) hover:bg-surface-muted"
        >
          {t('exit')}
        </a>
      </div>
    </aside>
  );
}
