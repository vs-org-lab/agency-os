'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import type { MoneyClientOption, MoneyExpenseRow } from '@/modules/money';
import { moneyError, type MoneyResult } from './expense-form';
import { DETAIL_SEPARATOR, SELECT, useMoneyFormat } from './money-summary';

export type ExpenseRowActions = {
  deleteExpense: (expenseId: string) => Promise<MoneyResult>;
  linkExpense: (expenseId: string, paymentRequestId: string | null) => Promise<MoneyResult>;
};

function ExpenseRow({
  expense,
  client,
  canWrite,
  actions,
  onEdit,
}: {
  expense: MoneyExpenseRow;
  client: MoneyClientOption | null;
  canWrite: boolean;
  actions: ExpenseRowActions;
  onEdit: (expense: MoneyExpenseRow) => void;
}) {
  const t = useTranslations('money');
  const format = useFormatter();
  const money = useMoneyFormat();
  const [message, setMessage] = useState<
    { tone: 'success'; key: 'linked' | 'deleted' } | { tone: 'danger'; key: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<MoneyResult>, success: 'linked' | 'deleted') =>
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
        <div className="flex min-w-0 flex-col">
          <span className="text-body-sm font-medium text-text">{expense.vendor}</span>
          <span className="text-caption text-text-secondary">
            {[
              format.dateTime(new Date(`${expense.spentOn}T12:00:00Z`), { dateStyle: 'medium' }),
              t(`categories.${expense.category}`),
              expense.description,
              expense.clientName,
              expense.paymentRequestNumber,
            ]
              .filter(Boolean)
              .join(DETAIL_SEPARATOR)}
          </span>
        </div>
        <span className="text-body-sm tabular-nums text-text">
          {money(expense.amount, expense.currency)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {expense.hasReceipt ? (
          <a
            href={`/api/money/receipts/${expense.id}`}
            className="text-caption text-primary underline-offset-2 hover:underline"
          >
            {t('expenses.receipt')}
          </a>
        ) : null}
        {canWrite && client ? (
          <label className="flex items-center gap-2 text-caption text-text-secondary">
            {t('expenses.link')}
            <select
              aria-label={t('expenses.link')}
              value={expense.paymentRequestId ?? ''}
              disabled={pending}
              onChange={(event) =>
                run(() => actions.linkExpense(expense.id, event.target.value || null), 'linked')
              }
              className={SELECT}
            >
              <option value="">{t('expenses.noRequest')}</option>
              {client.requests.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.number}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {canWrite ? (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(expense)}>
              {t('expenses.edit')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => actions.deleteExpense(expense.id), 'deleted')}
            >
              {t('expenses.delete')}
            </Button>
          </>
        ) : null}
      </div>
      {message ? (
        <FormMessage tone={message.tone}>
          {message.tone === 'success'
            ? t(`expenses.${message.key}`)
            : t(`errors.${moneyError(message.key)}`)}
        </FormMessage>
      ) : null}
    </li>
  );
}

/** RF-151 and RF-153: the year's expenses, with receipts and the link to the request that charges them. */
export function ExpensesTable({
  expenses,
  clients,
  canWrite,
  actions,
  onEdit = () => undefined,
}: {
  expenses: MoneyExpenseRow[];
  clients: MoneyClientOption[];
  canWrite: boolean;
  actions: ExpenseRowActions;
  onEdit?: (expense: MoneyExpenseRow) => void;
}) {
  const t = useTranslations('money.expenses');
  if (expenses.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('empty')}</p>;
  }
  return (
    <ul className="flex flex-col">
      {expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          client={clients.find((client) => client.id === expense.clientId) ?? null}
          canWrite={canWrite}
          actions={actions}
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
}
