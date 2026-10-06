'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { locales, type Locale } from '@agency-os/i18n';
import { cn } from '@agency-os/ui/lib/utils';
import { usePathname, useRouter } from '@/i18n/navigation';

const SHORT_LABEL: Record<Locale, string> = { 'pt-PT': 'PT', en: 'EN' };

export function LocaleSwitcher({
  label,
  labels,
}: {
  label: string;
  labels: Record<Locale, string>;
}) {
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md bg-surface-muted p-0.5"
    >
      {locales.map((locale) => {
        const checked = current === locale;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={labels[locale]}
            lang={locale}
            disabled={pending}
            onClick={() => startTransition(() => router.replace(pathname, { locale }))}
            className={cn(
              'rounded-sm px-2 py-0.5 text-caption font-medium transition-colors duration-(--duration-fast)',
              checked ? 'bg-surface text-text shadow-xs' : 'text-text-secondary hover:text-text',
            )}
          >
            {SHORT_LABEL[locale]}
          </button>
        );
      })}
    </div>
  );
}
