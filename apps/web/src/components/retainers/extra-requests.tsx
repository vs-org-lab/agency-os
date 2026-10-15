'use client';

import { useId, useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import type { RetainerExtraRow } from '@/modules/retainers';
import {
  decimal,
  retainerError,
  SELECT,
  useQuantity,
  type RetainerError,
  type RetainerResult,
} from './shared';

export type QuoteExtra = (
  extraRequestId: string,
  amount: string,
  currency: string,
) => Promise<RetainerResult>;

const CURRENCIES = ['EUR', 'GBP', 'USD', 'AOA'] as const;

function QuoteForm({ extra, quote }: { extra: RetainerExtraRow; quote: QuoteExtra }) {
  const t = useTranslations('retainers.extras');
  const tr = useTranslations('retainers');
  const id = useId();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [message, setMessage] = useState<'sent' | RetainerError | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await quote(extra.id, decimal(amount), currency).catch(() => ({
            ok: false as const,
            code: 'not_found',
          }));
          setMessage(result.ok ? 'sent' : retainerError(result.code));
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-amount`}>{t('amount')}</Label>
        <Input
          id={`${id}-amount`}
          inputMode="decimal"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="w-36"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-currency`}>{t('currency')}</Label>
        <select
          id={`${id}-currency`}
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          className={SELECT}
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {t('send')}
      </Button>
      {message === 'sent' ? (
        <FormMessage tone="success">{t('sent')}</FormMessage>
      ) : message ? (
        <FormMessage tone="danger">{tr(`errors.${message}`)}</FormMessage>
      ) : null}
    </form>
  );
}

/** RF-112: the extra requests, quoted by the team and decided by the client. */
export function ExtraRequests({
  extras,
  canWrite,
  quote,
}: {
  extras: RetainerExtraRow[];
  canWrite: boolean;
  quote: QuoteExtra;
}) {
  const t = useTranslations('retainers');
  const format = useFormatter();
  const quantity = useQuantity();
  if (extras.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('extras.empty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {extras.map((extra) => (
        <li
          key={extra.id}
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body-sm font-medium text-text">{extra.description}</span>
            <Badge variant={extra.status === 'approved' ? 'secondary' : 'outline'}>
              {t(`extras.statuses.${extra.status}`)}
            </Badge>
          </div>
          <p className="text-caption text-text-secondary">
            {[
              `${quantity(extra.quantity)} × ${t(`kinds.${extra.kind}`)}`,
              extra.quoteAmount && extra.currency
                ? t('extras.quote', {
                    amount: format.number(Number(extra.quoteAmount), {
                      style: 'currency',
                      currency: extra.currency,
                    }),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {canWrite && extra.status === 'requested' ? (
            <QuoteForm extra={extra} quote={quote} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
