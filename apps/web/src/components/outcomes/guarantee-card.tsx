'use client';

import { useTranslations } from 'next-intl';
import type { GuaranteeView } from '@/modules/outcomes';
import { useLongDate } from './shared';

function todayInLisbon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

/** RF-123: the guarantee's state in one sentence, with its reason or the months used. */
export function GuaranteeCard({
  guarantee,
  deadline,
}: {
  guarantee: GuaranteeView;
  deadline: string;
}) {
  const t = useTranslations('outcomes.guarantee');
  const longDate = useLongDate();

  const text = (() => {
    switch (guarantee.status) {
      case 'pending':
        return deadline < todayInLisbon()
          ? t('deadlinePassed', { deadline: longDate(deadline) })
          : t('pending', { deadline: longDate(deadline) });
      case 'not_activated':
        return guarantee.reason === 'target_met'
          ? t('notActivatedTargetMet')
          : t('notActivatedConditionsFailed');
      case 'active':
        return t('active', {
          date: guarantee.activatedOn ? longDate(guarantee.activatedOn) : '',
          months: guarantee.monthsUsed,
        });
      case 'closed':
        return guarantee.reason === 'months_used' ? t('closedMonthsUsed') : t('closedTargetMet');
    }
  })();

  return (
    <p className="rounded-lg border border-border bg-surface px-4 py-3 text-body-sm text-text">
      {text}
    </p>
  );
}
