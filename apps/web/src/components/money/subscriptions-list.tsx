'use client';

import { useId, useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { CURRENCIES, EXPENSE_CATEGORIES, type MoneySubscriptionRow } from '@/modules/money';
import { moneyError, type MoneyResult } from './expense-form';
import { DETAIL_SEPARATOR, SELECT, useMoneyFormat } from './money-summary';

export type SubscriptionFormInput = {
  id?: string;
  name: string;
  vendor: string;
  category: string;
  amount: string;
  currency: string;
  cycle: string;
  nextRenewalOn: string;
};

export type SubscriptionActions = {
  saveSubscription: (input: SubscriptionFormInput) => Promise<MoneyResult>;
  renewSubscription: (subscriptionId: string) => Promise<MoneyResult>;
  cancelSubscription: (subscriptionId: string) => Promise<MoneyResult>;
};

function SubscriptionItem({
  subscription,
  canWrite,
  actions,
}: {
  subscription: MoneySubscriptionRow;
  canWrite: boolean;
  actions: SubscriptionActions;
}) {
  const t = useTranslations('money.subscriptions');
  const tm = useTranslations('money');
  const format = useFormatter();
  const money = useMoneyFormat();
  const [message, setMessage] = useState<
    | { tone: 'success'; key: 'renewed' | 'cancelledDone' | 'saved' }
    | { tone: 'danger'; key: string }
    | null
  >(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const active = subscription.status === 'active';

  const run = (action: () => Promise<MoneyResult>, success: 'renewed' | 'cancelledDone') =>
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false as const, code: 'not_found' }));
      setMessage(
        result.ok
          ? { tone: 'success', key: success }
          : { tone: 'danger', key: moneyError(result.code) },
      );
    });

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-body-sm font-medium text-text">
            {subscription.name}
            {subscription.renewal === 'overdue' ? (
              <Badge variant="destructive">{t('overdue')}</Badge>
            ) : subscription.renewal === 'soon' ? (
              <Badge variant="secondary">{t('soon')}</Badge>
            ) : null}
            {!active ? <Badge variant="outline">{t('cancelled')}</Badge> : null}
          </span>
          <span className="text-caption text-text-secondary">
            {[
              t(`cycles.${subscription.cycle}`),
              tm(`categories.${subscription.category}`),
              active
                ? t('nextRenewal', {
                    date: format.dateTime(new Date(`${subscription.nextRenewalOn}T12:00:00Z`), {
                      dateStyle: 'medium',
                    }),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(DETAIL_SEPARATOR)}
          </span>
        </div>
        <span className="text-body-sm tabular-nums text-text">
          {money(subscription.amount, subscription.currency)}
        </span>
      </div>
      {canWrite && active ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => actions.renewSubscription(subscription.id), 'renewed')}
          >
            {t('renew')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => actions.cancelSubscription(subscription.id), 'cancelledDone')}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing((open) => !open)}
          >
            {tm('expenses.edit')}
          </Button>
        </div>
      ) : null}
      {canWrite && editing ? (
        <SubscriptionForm
          initial={subscription}
          save={actions.saveSubscription}
          onDone={() => {
            setEditing(false);
            setMessage({ tone: 'success', key: 'saved' });
          }}
        />
      ) : null}
      {message ? (
        <FormMessage tone={message.tone}>
          {message.tone === 'danger'
            ? tm(`errors.${moneyError(message.key)}`)
            : message.key === 'saved'
              ? tm('subscriptionForm.saved')
              : t(message.key)}
        </FormMessage>
      ) : null}
    </li>
  );
}

/** RF-151: subscriptions by renewal date, with the ones due soon or overdue highlighted. */
export function SubscriptionsList({
  subscriptions,
  canWrite,
  actions,
}: {
  subscriptions: MoneySubscriptionRow[];
  canWrite: boolean;
  actions: SubscriptionActions;
}) {
  const t = useTranslations('money.subscriptions');
  if (subscriptions.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('empty')}</p>;
  }
  return (
    <ul className="flex flex-col">
      {subscriptions.map((subscription) => (
        <SubscriptionItem
          key={subscription.id}
          subscription={subscription}
          canWrite={canWrite}
          actions={actions}
        />
      ))}
    </ul>
  );
}

export function SubscriptionForm({
  save,
  onDone,
  initial = null,
}: {
  save: SubscriptionActions['saveSubscription'];
  onDone: () => void;
  initial?: MoneySubscriptionRow | null;
}) {
  const t = useTranslations('money');
  const id = useId();
  const [fields, setFields] = useState<SubscriptionFormInput>({
    name: initial?.name ?? '',
    vendor: initial?.vendor ?? '',
    category: initial?.category ?? 'software',
    amount: initial?.amount ?? '',
    currency: initial?.currency ?? 'EUR',
    cycle: initial?.cycle ?? 'monthly',
    nextRenewalOn: initial?.nextRenewalOn ?? '',
  });
  const [message, setMessage] = useState<
    { tone: 'success' } | { tone: 'danger'; error: ReturnType<typeof moneyError> } | null
  >(null);
  const [pending, startTransition] = useTransition();
  const field = (name: string) => `${id}-${name}`;
  const set = (name: keyof SubscriptionFormInput) => (value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await save({
            ...(initial ? { id: initial.id } : {}),
            ...fields,
            amount: fields.amount.replace(',', '.'),
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) {
            setMessage({ tone: 'success' });
            onDone();
          } else setMessage({ tone: 'danger', error: moneyError(result.code) });
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('name')}>{t('subscriptionForm.name')}</Label>
          <Input
            id={field('name')}
            required
            maxLength={80}
            value={fields.name}
            onChange={(event) => set('name')(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('vendor')}>{t('subscriptionForm.vendor')}</Label>
          <Input
            id={field('vendor')}
            maxLength={120}
            value={fields.vendor}
            onChange={(event) => set('vendor')(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('category')}>{t('subscriptionForm.category')}</Label>
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
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('cycle')}>{t('subscriptionForm.cycle')}</Label>
          <select
            id={field('cycle')}
            value={fields.cycle}
            onChange={(event) => set('cycle')(event.target.value)}
            className={SELECT}
          >
            <option value="monthly">{t('subscriptions.cycles.monthly')}</option>
            <option value="annual">{t('subscriptions.cycles.annual')}</option>
          </select>
        </div>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={field('amount')}>{t('subscriptionForm.amount')}</Label>
            <Input
              id={field('amount')}
              inputMode="decimal"
              required
              value={fields.amount}
              onChange={(event) => set('amount')(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={field('currency')}>{t('subscriptionForm.currency')}</Label>
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
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('next')}>{t('subscriptionForm.nextRenewalOn')}</Label>
          <Input
            id={field('next')}
            type="date"
            required
            value={fields.nextRenewalOn}
            onChange={(event) => set('nextRenewalOn')(event.target.value)}
          />
        </div>
      </div>
      {message ? (
        <FormMessage tone={message.tone}>
          {message.tone === 'success' ? t('subscriptionForm.saved') : t(`errors.${message.error}`)}
        </FormMessage>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t('subscriptionForm.save')}
      </Button>
    </form>
  );
}
