'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { formatMoney, type Locale } from '@agency-os/i18n';
import { m, transitions } from '@agency-os/ui/motion';
import type { PortalInvoice } from '@/modules/billing';
import { toMinorUnits } from '@/modules/contracts';

export type ReceiptInvoice = Pick<
  PortalInvoice,
  'id' | 'number' | 'amount' | 'currency' | 'status' | 'paidAt'
>;

type Mode = 'printing' | 'printed';

const storageKey = (requestId: string) => `payment-moment:${requestId}`;

/**
 * Decides whether this device still owes the request its moment. The marker lives in this
 * browser only, so another device repeats a purely visual effect, which is acceptable. Without
 * storage, or with reduced motion, the receipt appears already printed.
 */
function decideMode(requestId: string): Mode {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const key = storageKey(requestId);
    const seen = window.localStorage.getItem(key) !== null;
    if (!seen) window.localStorage.setItem(key, '1');
    return seen || reduced ? 'printed' : 'printing';
  } catch {
    return 'printed';
  }
}

/** The receipt of a paid request, printed out of a slot the first time this device sees it. */
export function ReceiptMoment({ invoice }: { invoice: ReceiptInvoice }) {
  const t = useTranslations('portal.invoices.receipt');
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const paid = invoice.status === 'paid';
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    if (paid) setMode(decideMode(invoice.id));
  }, [paid, invoice.id]);

  if (!paid || mode === null) return null;

  return (
    <section
      aria-label={t('title')}
      data-receipt={mode}
      className="flex flex-col gap-1 rounded-lg border border-border bg-surface-muted p-3"
    >
      <div aria-hidden="true" className="h-1.5 rounded-full bg-text" />
      <div className="overflow-hidden">
        <m.article
          initial={mode === 'printing' ? { y: '-100%' } : false}
          animate={{ y: 0 }}
          transition={transitions.moment}
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4"
        >
          <h3 className="text-title-sm text-text">{t('title')}</h3>
          <p className="text-body-sm text-text-secondary">{t('thanks')}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
            <dt className="text-text-secondary">{t('request')}</dt>
            <dd className="font-mono text-text">{invoice.number}</dd>
            <dt className="text-text-secondary">{t('amount')}</dt>
            <dd className="tabular-nums text-text">
              {formatMoney(toMinorUnits(invoice.amount), invoice.currency, locale)}
            </dd>
            {invoice.paidAt ? (
              <>
                <dt className="text-text-secondary">{t('date')}</dt>
                <dd className="text-text">
                  {format.dateTime(invoice.paidAt, { dateStyle: 'long' })}
                </dd>
              </>
            ) : null}
          </dl>
        </m.article>
      </div>
    </section>
  );
}
