'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney, type Currency, type Locale } from '@agency-os/i18n';
import {
  RequestBlock,
  type RequestActions,
  type RequestFeedback,
} from '@/components/billing/request-block';
import { FormMessage } from '@/components/forms/form-message';
import { toMinorUnits } from '@/modules/contracts';
import type { RetainerBillingView } from '@/modules/retainers';

/** C-10 Billing (spec 3B.2 §2.9): the retainer's payment requests with the 1D actions. */
export function RetainerBilling({
  view,
  actions,
}: {
  view: RetainerBillingView;
  actions: RequestActions;
}) {
  const t = useTranslations('retainers.billing');
  const tDeal = useTranslations('billing.deal');
  const locale = useLocale() as Locale;
  const [feedback, setFeedback] = useState<RequestFeedback | null>(null);

  return (
    <section className="flex flex-col gap-3" aria-label={t('title')}>
      <h3 className="text-body font-medium text-text">{t('title')}</h3>
      {view.contractMissing ? <FormMessage tone="info">{t('noContract')}</FormMessage> : null}
      {feedback?.tone === 'success' ? (
        <FormMessage tone="success">{tDeal(`done.${feedback.key}`)}</FormMessage>
      ) : feedback ? (
        <FormMessage tone="danger">{tDeal(`errors.${feedback.error}`)}</FormMessage>
      ) : null}
      {view.requests.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {view.requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body-sm font-medium text-text">{request.label}</span>
                <span className="text-body-sm tabular-nums text-text">
                  {formatMoney(toMinorUnits(request.amount), request.currency as Currency, locale)}
                </span>
              </div>
              <RequestBlock
                request={request}
                writable={view.canWrite}
                actions={actions}
                onFeedback={setFeedback}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
