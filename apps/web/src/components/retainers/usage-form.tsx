'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { SelectField } from '@/components/forms/select-field';
import type { LimitMonth } from '@/modules/retainers';
import { decimal, retainerError, type RetainerError, type RetainerResult } from './shared';

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
  onDone,
}: {
  retainerId: string;
  limits: LimitMonth[];
  record: RecordUsage;
  /** Called with the confirmation once the usage is saved, so the dialog can close and notify. */
  onDone: (message: string) => void;
}) {
  const t = useTranslations('retainers');
  const id = useId();
  const [kind, setKind] = useState<string>(limits[0]?.kind ?? '');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<RetainerError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await record({
            retainerId,
            kind,
            quantity: decimal(quantity),
            description: description.trim(),
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) onDone(t('usage.saved'));
          else setError(retainerError(result.code));
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-kind`}>{t('usage.kind')}</Label>
          <SelectField
            id={`${id}-kind`}
            name="kind"
            value={kind}
            onValueChange={setKind}
            options={limits.map((limit) => ({
              value: limit.kind,
              label: t(`kinds.${limit.kind}`),
            }))}
          />
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
      {error ? (
        <FormMessage tone={error === 'limit_reached' ? 'info' : 'danger'}>
          {t(`errors.${error}`)}
        </FormMessage>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t('usage.save')}
      </Button>
    </form>
  );
}
