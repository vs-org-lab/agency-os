'use client';

import { useId, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { locales, type Locale } from '@agency-os/i18n';
import { LayoutGroup, m, transitions } from '@agency-os/ui/motion';
import { cn } from '@agency-os/ui/lib/utils';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleSwitcher({
  label,
  labels,
  className,
}: {
  label: string;
  labels: Record<Locale, string>;
  className?: string;
}) {
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const groupId = useId();
  const [pending, startTransition] = useTransition();

  return (
    <LayoutGroup id={groupId}>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          'grid grid-cols-2 rounded-md border border-border bg-canvas p-0.5',
          className,
        )}
      >
        {locales.map((locale) => {
          const checked = current === locale;
          return (
            <button
              key={locale}
              type="button"
              role="radio"
              aria-checked={checked}
              lang={locale}
              disabled={pending}
              onClick={() => startTransition(() => router.replace(pathname, { locale }))}
              className={cn(
                'relative isolate h-7 rounded-sm px-2 text-caption font-medium transition-colors duration-(--duration-fast)',
                checked ? 'text-text' : 'text-text-secondary hover:text-text',
              )}
            >
              {checked ? (
                <m.span
                  layoutId="locale-indicator"
                  aria-hidden="true"
                  transition={transitions.morph}
                  className="absolute inset-0 -z-10 rounded-sm bg-surface-muted ring-1 ring-border-strong"
                />
              ) : null}
              {labels[locale]}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
