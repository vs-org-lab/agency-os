'use client';

import { useTranslations } from 'next-intl';
import { useQuantity } from '@/components/retainers/shared';
import { CARRY_SHARE, type RetainerLimitKind } from '@/modules/retainers';

export type PortalPlan = {
  tier: string;
  limits: { kind: RetainerLimitKind; limit: number }[];
};

/** What the plan includes and the rules that apply to it, from the limits and the carry rule. */
export function PlanPanel({ plan }: { plan: PortalPlan }) {
  const t = useTranslations('portal.dashboard.plan');
  const tKinds = useTranslations('retainers.kinds');
  const quantity = useQuantity();

  return (
    <aside aria-labelledby="portal-plan" className="flex flex-col gap-4">
      <header className="flex flex-col gap-0.5">
        <h2 id="portal-plan" className="text-title-sm text-text">
          {t('title')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('tier', { tier: plan.tier })}</p>
      </header>
      <section className="flex flex-col gap-2" aria-label={t('includes')}>
        <h3 className="text-body-sm font-medium text-text">{t('includes')}</h3>
        <ul className="flex flex-col gap-1">
          {plan.limits.map((entry) => (
            <li key={entry.kind} className="flex justify-between gap-3 text-body-sm">
              <span className="text-text">{tKinds(entry.kind)}</span>
              <span className="text-text-secondary">
                {t('perMonth', { count: quantity(entry.limit) })}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2" aria-label={t('rules')}>
        <h3 className="text-body-sm font-medium text-text">{t('rules')}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-body-sm text-text-secondary">
          <li>{t('carry', { share: Math.round(CARRY_SHARE * 100) })}</li>
          <li>{t('expires')}</li>
          <li>{t('extra')}</li>
        </ul>
      </section>
    </aside>
  );
}
