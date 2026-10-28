import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney, type Locale } from '@agency-os/i18n';
import { AnimatedNumber } from '@agency-os/ui/components/animated-number';
import type { HomeView } from '@/modules/studio';

function Indicator({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4">
      <dt className="text-caption font-medium text-text-tertiary">{label}</dt>
      <dd className="text-display font-semibold tracking-[-0.02em] text-text tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/** The S-01 figures in one strip; "por receber" is left out for whoever does not read billing. */
export function HomeIndicators({ indicators }: { indicators: HomeView['indicators'] }) {
  const t = useTranslations('studio.home.indicators');
  const locale = useLocale() as Locale;

  return (
    <dl
      aria-label={t('label')}
      className="rd-rise grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-surface md:auto-cols-fr md:grid-flow-col md:grid-cols-none md:divide-x [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-border md:[&>*:nth-child(n+3)]:border-t-0"
    >
      <Indicator
        label={t('clients')}
        value={<AnimatedNumber value={indicators.clients} locale={locale} />}
      />
      <Indicator
        label={t('activeProjects')}
        value={<AnimatedNumber value={indicators.activeProjects} locale={locale} />}
      />
      <Indicator
        label={t('waiting')}
        value={<AnimatedNumber value={indicators.waiting} locale={locale} />}
      />
      {indicators.receivable === null ? null : (
        <Indicator
          label={t('receivable')}
          value={
            indicators.receivable.length === 0
              ? formatMoney(0n, 'EUR', locale)
              : indicators.receivable
                  .map((total) => formatMoney(total.amountMinor, total.currency, locale))
                  .join(' · ')
          }
        />
      )}
    </dl>
  );
}
