'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import type { LimitMonth } from '@/modules/retainers';
import { decimal, retainerError, SELECT, type RetainerError, type RetainerResult } from './shared';

export type RecordUsage = (input: {
  retainerId: string;
  kind: string;
  quantity: string;
  description: string;
}) => Promise<RetainerResult>;

/** RF-111: the team records this month's work against one of the limits. */
export function UsageForm({
  retainerId,
  limits,
  record,
}: {
  retainerId: string;
  limits: LimitMonth[];
  record: RecordUsage;
}) {
  const t = useTranslations('retainers');
  const id = useId();
  const [kind, setKind] = useState<string>(limits[0]?.kind ?? '');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<'saved' | RetainerError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await record({
            retainerId,
            kind,
            quantity: decimal(quantity),
            description: description.trim(),
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) {
            setDescription('');
            setMessage('saved');
          } else setMessage(retainerError(result.code));
        });
      }}
    >
      <h4 className="text-body-sm font-medium text-text">{t('usage.title')}</h4>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-kind`}>{t('usage.kind')}</Label>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className={SELECT}
          >
            {limits.map((limit) => (
              <option key={limit.kind} value={limit.kind}>
                {t(`kinds.${limit.kind}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-quantity`}>{t('usage.quantity')}</Label>
          <Input
            id={`${id}-quantity`}
            inputMode="decimal"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={`${id}-description`}>{t('usage.description')}</Label>
          <Input
            id={`${id}-description`}
            required
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
      {message === 'saved' ? (
        <FormMessage tone="success">{t('usage.saved')}</FormMessage>
      ) : message ? (
        <FormMessage tone={message === 'limit_reached' ? 'info' : 'danger'}>
          {t(`errors.${message}`)}
        </FormMessage>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t('usage.save')}
      </Button>
    </form>
  );
}
