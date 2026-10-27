'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { formatMoney, type Locale } from '@agency-os/i18n';
import { FormMessage } from '@/components/forms/form-message';
import { isCardCurrency, type PortalInvoice } from '@/modules/billing';
import { toMinorUnits } from '@/modules/contracts';

export type PayResult = { ok: true; url: string } | { ok: false; code: string };

export type PayAction = (requestId: string) => Promise<PayResult>;

type PayError = 'unavailable' | 'not_found';

const LINK = 'text-body-sm text-link hover:underline';

function calendarDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

/** One payment request in P-06: amount and status, how to pay while open, the invoice once paid. */
export function InvoiceCard({
  invoice,
  cardEnabled,
  pay,
}: {
  invoice: PortalInvoice;
  cardEnabled: boolean;
  pay: PayAction;
}) {
  const t = useTranslations('portal.invoices');
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const [error, setError] = useState<PayError | null>(null);
  const [pending, startTransition] = useTransition();
  const open = invoice.status === 'sent';
  const day = (value: string) => format.dateTime(calendarDate(value), { dateStyle: 'long' });
  const headingId = `invoice-${invoice.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-title-sm text-text">
            {t('heading', { label: invoice.label, number: invoice.number })}
          </h2>
          <span className="text-caption text-text-tertiary">
            {t('issuedBy', { name: invoice.issuerName })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={open ? 'outline' : 'secondary'}>{t(`status.${invoice.status}`)}</Badge>
          {invoice.overdueDays > 0 ? (
            <Badge variant="destructive">{t('overdue', { days: invoice.overdueDays })}</Badge>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-display font-semibold tracking-[-0.02em] tabular-nums text-text">
          {formatMoney(toMinorUnits(invoice.amount), invoice.currency, locale)}
        </span>
        <span className="text-body-sm text-text-secondary">
          {invoice.paidAt
            ? t('paidOn', { date: format.dateTime(invoice.paidAt, { dateStyle: 'long' }) })
            : t('due', { date: day(invoice.dueDate) })}
        </span>
      </div>

      {open ? (
        <div className="flex flex-col gap-3">
          {cardEnabled && isCardCurrency(invoice.currency) ? (
            <div className="flex flex-col gap-2 md:w-64">
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    const result = await pay(invoice.id).catch(
                      () => ({ ok: false, code: 'not_found' }) as const,
                    );
                    if (result.ok) window.location.assign(result.url);
                    else setError(result.code === 'unavailable' ? 'unavailable' : 'not_found');
                  })
                }
              >
                {t('payCard')}
              </Button>
            </div>
          ) : null}
          {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}

          <section
            aria-label={t('bankTitle')}
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-4"
          >
            <h3 className="text-label text-text">{t('bankTitle')}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
              {invoice.bank.bankName ? (
                <>
                  <dt className="text-text-secondary">{t('bankName')}</dt>
                  <dd className="text-text">{invoice.bank.bankName}</dd>
                </>
              ) : null}
              {invoice.bank.iban ? (
                <>
                  <dt className="text-text-secondary">{t('iban')}</dt>
                  <dd className="break-all font-mono text-text">{invoice.bank.iban}</dd>
                </>
              ) : null}
              {invoice.bank.bic ? (
                <>
                  <dt className="text-text-secondary">{t('bic')}</dt>
                  <dd className="font-mono text-text">{invoice.bank.bic}</dd>
                </>
              ) : null}
            </dl>
            {invoice.bank.paymentInstructions ? (
              <p className="whitespace-pre-line text-body-sm text-text">
                {invoice.bank.paymentInstructions}
              </p>
            ) : null}
            <p className="text-body-sm font-medium text-text">
              {t('reference', { number: invoice.number })}
            </p>
          </section>
        </div>
      ) : invoice.legalInvoice ? (
        <p className="text-body-sm text-text">
          {t('invoice', {
            number: invoice.legalInvoice.number,
            date: day(invoice.legalInvoice.issuedOn),
          })}
        </p>
      ) : (
        <p className="text-body-sm text-text-secondary">{t('invoicePending')}</p>
      )}

      <div className="flex flex-wrap gap-4">
        {invoice.pdfAvailable ? (
          <a href={`/api/billing/request/${invoice.id}`} className={LINK}>
            {t('requestPdf', { number: invoice.number })}
          </a>
        ) : null}
        {invoice.legalInvoice ? (
          <a href={`/api/billing/invoice/${invoice.id}`} className={LINK}>
            {t('invoicePdf', { number: invoice.legalInvoice.number })}
          </a>
        ) : null}
      </div>
      {invoice.receipts.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 id={`${headingId}-receipts`} className="text-label text-text">
            {t('receipts')}
          </h3>
          <ul aria-labelledby={`${headingId}-receipts`} className="flex flex-wrap gap-x-4 gap-y-1">
            {invoice.receipts.map((receipt) => (
              <li key={receipt.expenseId}>
                <a href={`/api/money/receipts/${receipt.expenseId}`} className={LINK}>
                  {receipt.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
