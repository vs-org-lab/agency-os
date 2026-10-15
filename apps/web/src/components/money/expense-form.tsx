'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { uploadToSignedUrl } from '@/components/proofing/upload';
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  type MoneyClientOption,
  type MoneyExpenseRow,
} from '@/modules/money';
import type { ReceiptProposal } from '@/platform/receipt-reader';
import { SELECT } from './money-summary';

export type MoneyResult = { ok: true } | { ok: false; code: string };

export type ExpenseFormInput = {
  id?: string;
  spentOn: string;
  vendor: string;
  description: string;
  category: string;
  amount: string;
  currency: string;
  clientId?: string;
  receiptId?: string;
  receiptName?: string;
};

export type ExpenseFormActions = {
  startUpload: (input: {
    fileName: string;
    sizeBytes: number;
  }) => Promise<{ ok: true; receiptId: string; uploadUrl: string } | { ok: false; code: string }>;
  readReceipt: (
    receiptId: string,
  ) => Promise<
    { ok: true; mimeType: string; proposal: ReceiptProposal | null } | { ok: false; code: string }
  >;
  saveExpense: (input: ExpenseFormInput) => Promise<MoneyResult>;
};

const ERRORS = ['invalid_input', 'invalid_file', 'invalid_state', 'not_found', 'upload_failed'];
type MoneyError =
  'invalid_input' | 'invalid_file' | 'invalid_state' | 'not_found' | 'upload_failed';
export const moneyError = (code: string): MoneyError =>
  (ERRORS.includes(code) ? code : 'not_found') as MoneyError;

const ACCEPTED_RECEIPTS = 'image/jpeg,image/png,image/webp,application/pdf';

type Fields = {
  spentOn: string;
  vendor: string;
  description: string;
  category: string;
  amount: string;
  currency: string;
  clientId: string;
};

/**
 * RF-151 and RF-152: an expense with its receipt. A receipt image is read into a proposal that only
 * fills the fields still empty; nothing is saved until the person confirms.
 */
export function ExpenseForm({
  clients,
  actions,
  initial = null,
  upload = uploadToSignedUrl,
  onDone,
}: {
  clients: MoneyClientOption[];
  actions: ExpenseFormActions;
  initial?: MoneyExpenseRow | null;
  upload?: (url: string, file: File) => Promise<boolean>;
  onDone: () => void;
}) {
  const t = useTranslations('money');
  const id = useId();
  const [fields, setFields] = useState<Fields>({
    spentOn: initial?.spentOn ?? '',
    vendor: initial?.vendor ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? 'other',
    amount: initial?.amount ?? '',
    currency: initial?.currency ?? 'EUR',
    clientId: initial?.clientId ?? '',
  });
  const [receipt, setReceipt] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<'reading' | 'proposal' | 'noProposal' | 'saved' | null>(
    null,
  );
  const [error, setError] = useState<MoneyError | null>(null);
  const [pending, startTransition] = useTransition();
  const field = (name: string) => `${id}-${name}`;
  const set = (name: keyof Fields) => (value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  const attach = async (file: File) => {
    setError(null);
    setNotice('reading');
    const started = await actions
      .startUpload({ fileName: file.name, sizeBytes: file.size })
      .catch(() => ({ ok: false as const, code: 'not_found' }));
    if (!started.ok) {
      setNotice(null);
      setError(moneyError(started.code));
      return;
    }
    if (!(await upload(started.uploadUrl, file))) {
      setNotice(null);
      setError('upload_failed');
      return;
    }
    const read = await actions
      .readReceipt(started.receiptId)
      .catch(() => ({ ok: false as const, code: 'not_found' }));
    if (!read.ok) {
      setNotice(null);
      setError(moneyError(read.code));
      return;
    }
    setReceipt({ id: started.receiptId, name: file.name });
    const proposal = read.proposal;
    if (proposal) {
      setFields((current) => ({
        ...current,
        spentOn: current.spentOn || proposal.spentOn || '',
        vendor: current.vendor || proposal.vendor || '',
        description: current.description || proposal.description || '',
        amount: current.amount || proposal.amount || '',
        currency: proposal.currency && !current.amount ? proposal.currency : current.currency,
      }));
    }
    setNotice(proposal ? 'proposal' : 'noProposal');
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setError(null);
          const result = await actions
            .saveExpense({
              ...(initial ? { id: initial.id } : {}),
              spentOn: fields.spentOn,
              vendor: fields.vendor,
              description: fields.description,
              category: fields.category,
              amount: fields.amount.replace(',', '.'),
              currency: fields.currency,
              ...(fields.clientId ? { clientId: fields.clientId } : {}),
              ...(receipt ? { receiptId: receipt.id, receiptName: receipt.name } : {}),
            })
            .catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) {
            setNotice('saved');
            onDone();
          } else setError(moneyError(result.code));
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={field('receipt')}>{t('expenseForm.receipt')}</Label>
        <input
          id={field('receipt')}
          type="file"
          accept={ACCEPTED_RECEIPTS}
          className="text-body-sm text-text"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void attach(file);
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('spentOn')}>{t('expenseForm.spentOn')}</Label>
          <Input
            id={field('spentOn')}
            type="date"
            required
            value={fields.spentOn}
            onChange={(event) => set('spentOn')(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('vendor')}>{t('expenseForm.vendor')}</Label>
          <Input
            id={field('vendor')}
            required
            maxLength={120}
            value={fields.vendor}
            onChange={(event) => set('vendor')(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={field('description')}>{t('expenseForm.description')}</Label>
          <Input
            id={field('description')}
            maxLength={500}
            value={fields.description}
            onChange={(event) => set('description')(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('category')}>{t('expenseForm.category')}</Label>
          <select
            id={field('category')}
            value={fields.category}
            onChange={(event) => set('category')(event.target.value)}
            className={SELECT}
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`categories.${category}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={field('amount')}>{t('expenseForm.amount')}</Label>
            <Input
              id={field('amount')}
              inputMode="decimal"
              required
              value={fields.amount}
              onChange={(event) => set('amount')(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={field('currency')}>{t('expenseForm.currency')}</Label>
            <select
              id={field('currency')}
              value={fields.currency}
              onChange={(event) => set('currency')(event.target.value)}
              className={SELECT}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={field('client')}>{t('expenseForm.client')}</Label>
          <select
            id={field('client')}
            value={fields.clientId}
            disabled={initial?.paymentRequestId != null}
            onChange={(event) => set('clientId')(event.target.value)}
            className={SELECT}
          >
            <option value="">{t('expenses.noClient')}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {notice && notice !== 'saved' ? (
        <FormMessage tone="info">{t(`expenseForm.${notice}`)}</FormMessage>
      ) : null}
      {notice === 'saved' ? (
        <FormMessage tone="success">{t('expenseForm.saved')}</FormMessage>
      ) : null}
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || notice === 'reading'}>
          {t('expenseForm.save')}
        </Button>
      </div>
    </form>
  );
}
