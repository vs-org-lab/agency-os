'use client';

import { useMemo, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { LineChart } from '@agency-os/ui/components/charts/line-chart';
import { DateRangeField } from '@agency-os/ui/components/date-range-field';
import { cn } from '@agency-os/ui/lib/utils';
import { Link, useRouter } from '@/i18n/navigation';
import {
  filterByRange,
  lisbonToday,
  monthlyTotals,
  rangePresets,
  type DateRange,
  type MoneyExpenseRow,
  type MoneyYearView,
} from '@/modules/money';
import { ExpenseForm, type ExpenseFormActions, type MoneyResult } from './expense-form';
import { ExpensesTable, type ExpenseRowActions } from './expenses-table';
import { MoneySummary } from './money-summary';
import { RequestsTable } from './requests-table';
import {
  SubscriptionForm,
  SubscriptionsList,
  type SubscriptionActions,
} from './subscriptions-list';

export type MoneyActions = ExpenseFormActions & ExpenseRowActions & SubscriptionActions;

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title-sm text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Runs an action and refreshes the page when it succeeds, so the year shows the change. */
function refreshing<A extends unknown[]>(
  run: (...args: A) => Promise<MoneyResult>,
  refresh: () => void,
): (...args: A) => Promise<MoneyResult> {
  return async (...args) => {
    const result = await run(...args);
    if (result.ok) refresh();
    return result;
  };
}

/** S-09: one year of money, with expenses and subscriptions for whoever writes. */
export function MoneyScreen({
  view,
  actions,
  range = null,
}: {
  view: MoneyYearView;
  actions: MoneyActions;
  /** Validated interval inside the year that narrows the request and expense tables. */
  range?: DateRange | null;
}) {
  const t = useTranslations('money');
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const refresh = () => router.refresh();
  const [expenseForm, setExpenseForm] = useState<{ initial: MoneyExpenseRow | null } | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState(false);
  const totals = useMemo(() => monthlyTotals(view.requests, view.expenses), [view]);
  const shown = useMemo(() => filterByRange(view.requests, view.expenses, range), [view, range]);
  const presets = useMemo(
    () =>
      rangePresets(lisbonToday(), view.year).map((preset) => ({
        ...preset,
        label: t(`range.presets.${preset.id}`),
      })),
    [view.year, t],
  );
  const monthLabels = Array.from({ length: 12 }, (_, month) =>
    format.dateTime(new Date(Date.UTC(view.year, month, 15)), { month: 'short', timeZone: 'UTC' }),
  );
  const euro = (value: number) =>
    format.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const chooseRange = (next: DateRange | null) =>
    router.push(
      next
        ? `/money?year=${view.year}&from=${next.from}&to=${next.to}`
        : `/money?year=${view.year}`,
    );

  const rowActions: ExpenseRowActions = {
    deleteExpense: refreshing(actions.deleteExpense, refresh),
    linkExpense: refreshing(actions.linkExpense, refresh),
  };
  const subscriptionActions: SubscriptionActions = {
    saveSubscription: refreshing(actions.saveSubscription, refresh),
    renewSubscription: refreshing(actions.renewSubscription, refresh),
    cancelSubscription: refreshing(actions.cancelSubscription, refresh),
  };

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-title text-text">{t('title')}</h1>
          <p className="text-body text-text-secondary">{t('description')}</p>
        </div>
        <nav aria-label={t('year')} className="flex flex-wrap gap-1">
          {view.years.map((year) => (
            <Link
              key={year}
              href={`/money?year=${year}`}
              aria-current={year === view.year ? 'page' : undefined}
              className={cn(
                'rounded-md border border-border px-3 py-1 text-body-sm tabular-nums',
                year === view.year
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text hover:bg-surface-muted',
              )}
            >
              {year}
            </Link>
          ))}
        </nav>
      </header>

      <section aria-label={t('chart.title')} className="flex flex-col gap-2">
        <h2 className="text-title-sm text-text">{t('chart.title')}</h2>
        <LineChart
          series={[
            { key: 'received', label: t('summary.received'), values: totals.received },
            { key: 'spent', label: t('summary.spent'), values: totals.spent },
          ]}
          labels={monthLabels}
          formatValue={euro}
          summary={t('chart.summary', { year: view.year })}
        />
        {totals.otherCurrencies ? (
          <p className="text-body-sm text-text-secondary">{t('chart.otherCurrencies')}</p>
        ) : null}
      </section>

      <MoneySummary summary={view.summary} />

      <DateRangeField
        locale={locale}
        label={t('range.label')}
        placeholder={t('range.placeholder')}
        clearLabel={t('range.clear')}
        value={range}
        onChange={chooseRange}
        min={`${view.year}-01-01`}
        max={`${view.year}-12-31`}
        presets={presets}
        className="self-start"
      />

      <Section title={t('requests.title')}>
        <RequestsTable requests={shown.requests} />
      </Section>

      <Section
        title={t('expenses.title')}
        action={
          view.canWrite ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setExpenseForm(expenseForm ? null : { initial: null })}
            >
              {t('expenses.add')}
            </Button>
          ) : null
        }
      >
        {view.canWrite && expenseForm ? (
          <ExpenseForm
            key={expenseForm.initial?.id ?? 'new'}
            clients={view.clients}
            initial={expenseForm.initial}
            actions={{
              startUpload: actions.startUpload,
              readReceipt: actions.readReceipt,
              saveExpense: actions.saveExpense,
            }}
            onDone={() => {
              setExpenseForm(null);
              refresh();
            }}
          />
        ) : null}
        <ExpensesTable
          expenses={shown.expenses}
          clients={view.clients}
          canWrite={view.canWrite}
          actions={rowActions}
          onEdit={(expense) => setExpenseForm({ initial: expense })}
        />
      </Section>

      <Section
        title={t('subscriptions.title')}
        action={
          view.canWrite ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSubscriptionForm((open) => !open)}
            >
              {t('subscriptions.add')}
            </Button>
          ) : null
        }
      >
        {view.canWrite && subscriptionForm ? (
          <SubscriptionForm
            save={subscriptionActions.saveSubscription}
            onDone={() => setSubscriptionForm(false)}
          />
        ) : null}
        <SubscriptionsList
          subscriptions={view.subscriptions}
          canWrite={view.canWrite}
          actions={subscriptionActions}
        />
      </Section>
    </div>
  );
}
