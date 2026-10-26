'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AllowanceRing } from '@agency-os/ui/components/allowance-ring';
import type { LimitMonth, MonthProgress } from '@/modules/retainers';
import { useQuantity } from './shared';

/**
 * RF-111: one ring per limit of the month with what is used, left and carried over, plus a ring for
 * the period itself that counts the days until the month closes in Lisbon, as the server saw them.
 */
export function LimitRings({ limits, period }: { limits: LimitMonth[]; period: MonthProgress }) {
  const t = useTranslations('retainers');
  const locale = useLocale();
  const quantity = useQuantity();

  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {limits.map((limit) => (
        <div key={limit.kind} className="flex flex-col gap-1">
          <AllowanceRing
            used={limit.used}
            limit={limit.available}
            locale={locale}
            label={t(`kinds.${limit.kind}`)}
            remainingLabel={(remaining) => t('remaining', { remaining })}
            usedLabel={(used, available) => t('usedOf', { used, available })}
          />
          {limit.carry > 0 ? (
            <p className="text-caption text-text-secondary">
              {t('carry', { carry: quantity(limit.carry) })}
            </p>
          ) : null}
        </div>
      ))}
      <AllowanceRing
        used={period.day}
        limit={period.total}
        neutral
        locale={locale}
        label={t('period.label')}
        remainingLabel={() => t('period.remaining', { count: period.left })}
        usedLabel={(day, total) => t('period.progress', { day, total })}
      />
    </div>
  );
}
