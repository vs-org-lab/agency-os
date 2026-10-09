'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import type {
  ManualPaymentMethod,
  RecordPaymentInput,
  RegisterLegalInvoiceInput,
} from '@/modules/billing';

export type BillingActionResult = { ok: true } | { ok: false; code: string };

export type UploadLinkResult = { ok: true; uploadUrl: string } | { ok: false; code: string };

export const BILLING_ERRORS = [
  'not_found',
  'invalid_input',
  'invalid_state',
  'too_soon',
  'missing_file',
  'upload_failed',
] as const;

export type BillingError = (typeof BILLING_ERRORS)[number];

export function billingError(code: string): BillingError {
  return (BILLING_ERRORS as readonly string[]).includes(code)
    ? (code as BillingError)
    : 'not_found';
}

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';

const MANUAL_METHODS: readonly ManualPaymentMethod[] = ['bank_transfer', 'multicaixa', 'other'];

function FormShell({
  label,
  error,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: {
  label: string;
  error: BillingError | null;
  pending: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations('billing.deal');
  return (
    <form
      aria-label={label}
      className="grid gap-3 rounded-md border border-border bg-surface-muted p-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <div className="flex flex-col gap-2 md:col-span-2">
        {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {submitLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('actions.cancel')}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Records a transfer, Multicaixa or other payment; keeps the typed values when refused. */
export function PaymentForm({
  requestId,
  number,
  amount,
  today,
  record,
  onDone,
  onCancel,
}: {
  requestId: string;
  number: string;
  amount: string;
  today: string;
  record: (input: RecordPaymentInput) => Promise<BillingActionResult>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('billing.deal');
  const [values, setValues] = useState({
    method: 'bank_transfer' as ManualPaymentMethod,
    amount,
    receivedOn: today,
    reference: '',
  });
  const [error, setError] = useState<BillingError | null>(null);
  const [pending, startTransition] = useTransition();
  const id = (name: string) => `payment-${requestId}-${name}`;
  const update = (patch: Partial<typeof values>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  };

  return (
    <FormShell
      label={t('forms.record', { number })}
      error={error}
      pending={pending}
      submitLabel={t('actions.saveRecord')}
      onCancel={onCancel}
      onSubmit={() =>
        startTransition(async () => {
          const result = await record({ requestId, ...values }).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (result.ok) onDone();
          else setError(billingError(result.code));
        })
      }
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={id('method')}>{t('fields.method')}</Label>
        <select
          id={id('method')}
          className={FIELD}
          value={values.method}
          onChange={(event) => update({ method: event.target.value as ManualPaymentMethod })}
        >
          {MANUAL_METHODS.map((method) => (
            <option key={method} value={method}>
              {t(`methods.${method}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={id('amount')}>{t('fields.amount')}</Label>
        <Input
          id={id('amount')}
          inputMode="decimal"
          required
          value={values.amount}
          onChange={(event) => update({ amount: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={id('receivedOn')}>{t('fields.receivedOn')}</Label>
        <Input
          id={id('receivedOn')}
          type="date"
          required
          max={today}
          value={values.receivedOn}
          onChange={(event) => update({ receivedOn: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={id('reference')}>{t('fields.reference')}</Label>
        <Input
          id={id('reference')}
          maxLength={120}
          autoComplete="off"
          value={values.reference}
          onChange={(event) => update({ reference: event.target.value })}
        />
      </div>
    </FormShell>
  );
}

export function VoidForm({
  requestId,
  number,
  voidRequest,
  onDone,
  onCancel,
}: {
  requestId: string;
  number: string;
  voidRequest: (requestId: string, reason: string) => Promise<BillingActionResult>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('billing.deal');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<BillingError | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = `void-${requestId}-reason`;

  return (
    <FormShell
      label={t('forms.void', { number })}
      error={error}
      pending={pending}
      submitLabel={t('actions.confirmVoid')}
      onCancel={onCancel}
      onSubmit={() =>
        startTransition(async () => {
          const result = await voidRequest(requestId, reason).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (result.ok) onDone();
          else setError(billingError(result.code));
        })
      }
    >
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor={fieldId}>{t('fields.voidReason')}</Label>
        <Textarea
          id={fieldId}
          required
          maxLength={500}
          rows={2}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
      </div>
    </FormShell>
  );
}

/** Uploads the PDF to a signed URL the way the Supabase storage client does. */
async function uploadPdf(url: string, file: File): Promise<boolean> {
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', file);
  const response = await fetch(url, {
    method: 'PUT',
    body: form,
    headers: { 'x-upsert': 'true' },
  }).catch(() => null);
  return response?.ok ?? false;
}

const MAX_PDF_BYTES = 10_485_760;

export function LegalInvoiceForm({
  requestId,
  number,
  today,
  uploadLink,
  register,
  onDone,
  onCancel,
}: {
  requestId: string;
  number: string;
  today: string;
  uploadLink: (requestId: string) => Promise<UploadLinkResult>;
  register: (input: RegisterLegalInvoiceInput) => Promise<BillingActionResult>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('billing.deal');
  const [values, setValues] = useState({
    issuer: 'at_certified' as RegisterLegalInvoiceInput['issuer'],
    number: '',
    issuedOn: today,
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<BillingError | null>(null);
  const [pending, startTransition] = useTransition();
  const id = (name: string) => `invoice-${requestId}-${name}`;
  const update = (patch: Partial<typeof values>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  };

  return (
    <FormShell
      label={t('forms.invoice', { number })}
      error={error}
      pending={pending}
      submitLabel={t('actions.saveInvoice')}
      onCancel={onCancel}
      onSubmit={() =>
        startTransition(async () => {
          if (!file || file.type !== 'application/pdf' || file.size > MAX_PDF_BYTES) {
            setError('missing_file');
            return;
          }
          const link = await uploadLink(requestId).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (!link.ok) {
            setError(billingError(link.code));
            return;
          }
          if (!(await uploadPdf(link.uploadUrl, file))) {
            setError('upload_failed');
            return;
          }
          const result = await register({ requestId, ...values }).catch(
            () => ({ ok: false, code: 'not_found' }) as const,
          );
          if (result.ok) onDone();
          else setError(billingError(result.code));
        })
      }
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={id('issuer')}>{t('fields.issuer')}</Label>
        <select
          id={id('issuer')}
          className={FIELD}
          value={values.issuer}
          onChange={(event) =>
            update({ issuer: event.target.value as RegisterLegalInvoiceInput['issuer'] })
          }
        >
          <option value="at_certified">{t('issuers.at_certified')}</option>
          <option value="agt_portal">{t('issuers.agt_portal')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={id('number')}>{t('fields.number')}</Label>
        <Input
          id={id('number')}
          required
          maxLength={60}
          autoComplete="off"
          value={values.number}
          onChange={(event) => update({ number: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={id('issuedOn')}>{t('fields.issuedOn')}</Label>
        <Input
          id={id('issuedOn')}
          type="date"
          required
          max={today}
          value={values.issuedOn}
          onChange={(event) => update({ issuedOn: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={id('file')}>{t('fields.file')}</Label>
        <Input
          id={id('file')}
          type="file"
          accept="application/pdf"
          required
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
      </div>
    </FormShell>
  );
}
