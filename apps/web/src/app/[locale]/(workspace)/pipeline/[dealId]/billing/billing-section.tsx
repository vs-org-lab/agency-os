'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { formatMoney, type Currency, type Locale } from '@agency-os/i18n';
import { FormMessage } from '@/components/forms/form-message';
import type {
  DealBilling,
  MilestoneView,
  PaymentRequestView,
  RecordPaymentInput,
  RegisterLegalInvoiceInput,
} from '@/modules/billing';
import { toMinorUnits } from '@/modules/contracts';
import {
  billingError,
  LegalInvoiceForm,
  PaymentForm,
  VoidForm,
  type BillingActionResult,
  type BillingError,
  type UploadLinkResult,
} from './billing-forms';

export type { BillingActionResult } from './billing-forms';

export type BillingActions = {
  createPlan(dealId: string): Promise<BillingActionResult>;
  request(milestoneId: string): Promise<BillingActionResult>;
  chase(requestId: string): Promise<BillingActionResult>;
  void(requestId: string, reason: string): Promise<BillingActionResult>;
  record(input: RecordPaymentInput): Promise<BillingActionResult>;
  settle(paymentId: string): Promise<BillingActionResult>;
  invoiceUpload(requestId: string): Promise<UploadLinkResult>;
  registerInvoice(input: RegisterLegalInvoiceInput): Promise<BillingActionResult>;
};

type DoneKey =
  'createPlan' | 'request' | 'chase' | 'void' | 'record' | 'settle' | 'registerInvoice';

type Feedback = { tone: 'success'; key: DoneKey } | { tone: 'danger'; error: BillingError };

type OpenForm = 'record' | 'void' | 'invoice' | null;

const LINK = 'text-body-sm text-link hover:underline';

function calendarDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function todayInLisbon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

function RequestBlock({
  request,
  writable,
  actions,
  onFeedback,
}: {
  request: PaymentRequestView;
  writable: boolean;
  actions: BillingActions;
  onFeedback: (feedback: Feedback) => void;
}) {
  const t = useTranslations('billing.deal');
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState<OpenForm>(null);
  const [pending, startTransition] = useTransition();
  const money = (amount: string, currency: string) =>
    formatMoney(toMinorUnits(amount), currency as Currency, locale);
  const day = (value: string) => format.dateTime(calendarDate(value), { dateStyle: 'medium' });
  const run = (key: DoneKey, action: () => Promise<BillingActionResult>) =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      onFeedback(
        result.ok ? { tone: 'success', key } : { tone: 'danger', error: billingError(result.code) },
      );
      if (result.ok) router.refresh();
    });
  const done = (key: DoneKey) => () => {
    setOpen(null);
    onFeedback({ tone: 'success', key });
    router.refresh();
  };
  const open_ = request.status === 'sent';
  const today = todayInLisbon();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm text-text">
          {t('request', { number: request.number, date: day(request.dueDate) })}
        </span>
        {request.overdueDays > 0 ? (
          <Badge variant="destructive">{t('overdue', { days: request.overdueDays })}</Badge>
        ) : null}
        {request.paidAt ? (
          <span className="text-body-sm text-text-secondary">
            {t('paidOn', { date: format.dateTime(request.paidAt, { dateStyle: 'medium' }) })}
          </span>
        ) : null}
        {request.pdfAvailable ? (
          <a href={`/api/billing/request/${request.id}`} className={LINK}>
            {t('requestPdf', { number: request.number })}
          </a>
        ) : null}
      </div>

      {request.payments.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-label text-text-secondary">{t('payments')}</h4>
          <ul className="flex flex-col gap-1">
            {request.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-2 text-body-sm">
                <span className="tabular-nums text-text">
                  {t('paymentLine', {
                    amount: money(payment.amount, payment.currency),
                    method: t(`methods.${payment.method}`),
                    date: day(payment.receivedOn),
                  })}
                </span>
                <Badge variant={payment.status === 'review' ? 'outline' : 'secondary'}>
                  {t(`paymentStatus.${payment.status}`)}
                </Badge>
                {writable && open_ && payment.status === 'review' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run('settle', () => actions.settle(payment.id))}
                  >
                    {t('actions.settle')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {request.legalInvoice ? (
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-text">
          <span>
            {t('invoice', {
              number: request.legalInvoice.number,
              issuer: t(`issuers.${request.legalInvoice.issuer}`),
              date: day(request.legalInvoice.issuedOn),
            })}
          </span>
          <a href={`/api/billing/invoice/${request.id}`} className={LINK}>
            {t('invoicePdf', { number: request.legalInvoice.number })}
          </a>
        </div>
      ) : request.status === 'paid' ? (
        <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-body-sm text-text">
          {t('missingInvoice')}
        </p>
      ) : null}

      {writable && open === null ? (
        <div className="flex flex-wrap gap-2">
          {open_ ? (
            <>
              <Button size="sm" onClick={() => setOpen('record')}>
                {t('actions.record')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run('chase', () => actions.chase(request.id))}
              >
                {t('actions.chase')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen('void')}>
                {t('actions.void')}
              </Button>
            </>
          ) : null}
          {request.status === 'paid' && !request.legalInvoice ? (
            <Button size="sm" onClick={() => setOpen('invoice')}>
              {t('actions.registerInvoice')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {open === 'record' ? (
        <PaymentForm
          requestId={request.id}
          number={request.number}
          amount={request.amount}
          today={today}
          record={actions.record}
          onDone={done('record')}
          onCancel={() => setOpen(null)}
        />
      ) : null}
      {open === 'void' ? (
        <VoidForm
          requestId={request.id}
          number={request.number}
          voidRequest={actions.void}
          onDone={done('void')}
          onCancel={() => setOpen(null)}
        />
      ) : null}
      {open === 'invoice' ? (
        <LegalInvoiceForm
          requestId={request.id}
          number={request.number}
          today={today}
          uploadLink={actions.invoiceUpload}
          register={actions.registerInvoice}
          onDone={done('registerInvoice')}
          onCancel={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function MilestoneCard({
  milestone,
  writable,
  actions,
  onFeedback,
}: {
  milestone: MilestoneView;
  writable: boolean;
  actions: BillingActions;
  onFeedback: (feedback: Feedback) => void;
}) {
  const t = useTranslations('billing.deal');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-title-sm text-text">
          {t('milestone', {
            position: milestone.position,
            label: milestone.label,
            percent: milestone.percent,
          })}
        </h3>
        <span className="tabular-nums text-body text-text">
          {formatMoney(toMinorUnits(milestone.amount), milestone.currency, locale)}
        </span>
        <Badge variant={milestone.status === 'paid' ? 'secondary' : 'outline'}>
          {t(`milestoneStatus.${milestone.status}`)}
        </Badge>
      </div>
      {milestone.request ? (
        <RequestBlock
          request={milestone.request}
          writable={writable}
          actions={actions}
          onFeedback={onFeedback}
        />
      ) : writable && milestone.status === 'pending' ? (
        <div>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await actions
                  .request(milestone.id)
                  .catch(() => ({ ok: false, code: 'not_found' }) as const);
                onFeedback(
                  result.ok
                    ? { tone: 'success', key: 'request' }
                    : { tone: 'danger', error: billingError(result.code) },
                );
                if (result.ok) router.refresh();
              })
            }
          >
            {t('actions.request')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** S-10 summarised: the deal's milestones, payment requests, payments and legal invoices. */
export function BillingSection({
  dealId,
  billing,
  writable,
  canCreatePlan,
  actions,
}: {
  dealId: string;
  billing: DealBilling | null;
  writable: boolean;
  /** A signed contract exists without a plan, e.g. signed before billing or its event pending. */
  canCreatePlan: boolean;
  actions: BillingActions;
}) {
  const t = useTranslations('billing.deal');
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();
  const createPlan = () =>
    startTransition(async () => {
      const result = await actions
        .createPlan(dealId)
        .catch(() => ({ ok: false, code: 'not_found' }) as const);
      setFeedback(
        result.ok
          ? { tone: 'success', key: 'createPlan' }
          : { tone: 'danger', error: billingError(result.code) },
      );
      if (result.ok) router.refresh();
    });

  return (
    <section
      aria-labelledby="billing-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 id="billing-title" className="text-title text-text">
          {t('title')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('nonFiscal')}</p>
      </header>
      <div aria-live="polite">
        {feedback?.tone === 'success' ? (
          <FormMessage tone="success">{t(`done.${feedback.key}`)}</FormMessage>
        ) : null}
        {feedback?.tone === 'danger' ? (
          <FormMessage tone="danger">{t(`errors.${feedback.error}`)}</FormMessage>
        ) : null}
      </div>
      {billing ? (
        <ol className="flex flex-col gap-3">
          {billing.milestones.map((milestone) => (
            <MilestoneCard
              key={milestone.id}
              milestone={milestone}
              writable={writable}
              actions={actions}
              onFeedback={setFeedback}
            />
          ))}
        </ol>
      ) : writable && canCreatePlan ? (
        <div>
          <Button disabled={pending} onClick={createPlan}>
            {t('actions.createPlan')}
          </Button>
        </div>
      ) : (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      )}
    </section>
  );
}
