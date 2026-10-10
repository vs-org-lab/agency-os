import { useLocale, useTranslations } from 'next-intl';
import { formatMoney, type Locale } from '@agency-os/i18n';
import type { HomeView } from '@/modules/studio';

function Indicator({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3">
      <dt className="text-caption text-text-secondary">{label}</dt>
      <dd className="text-title text-text tabular-nums">{value}</dd>
    </div>
  );
}

/** The S-01 figures; "por receber" is left out for whoever does not read billing. */
export function HomeIndicators({ indicators }: { indicators: HomeView['indicators'] }) {
  const t = useTranslations('studio.home.indicators');
  const locale = useLocale() as Locale;

  return (
    <dl aria-label={t('label')} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Indicator label={t('clients')} value={String(indicators.clients)} />
      <Indicator label={t('activeProjects')} value={String(indicators.activeProjects)} />
      <Indicator label={t('waiting')} value={String(indicators.waiting)} />
      {indicators.receivable === null ? null : (
        <Indicator
          label={t('receivable')}
          value={
            indicators.receivable.length === 0
              ? t('none')
              : indicators.receivable
                  .map((total) => formatMoney(total.amountMinor, total.currency, locale))
                  .join(' · ')
          }
        />
      )}
    </dl>
  );
}
