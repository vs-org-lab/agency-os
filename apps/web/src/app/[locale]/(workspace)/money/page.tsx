import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { MoneyScreen } from '@/components/money/money-screen';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { lisbonYear } from '@/modules/money';
import { loadMoneyYearView } from '@/modules/money/server';
import {
  cancelSubscriptionAction,
  deleteExpenseAction,
  linkExpenseAction,
  readReceiptAction,
  renewSubscriptionAction,
  saveExpenseAction,
  saveSubscriptionAction,
  startReceiptUploadAction,
} from '../../money-actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
};

/** S-09: the year's money for the founder, finance and managers. */
export default async function MoneyPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const requested = Number((await searchParams).year);
  const year = Number.isInteger(requested) ? requested : lisbonYear(new Date());
  const view = await loadMoneyYearView(session.claims, year);
  if (!view) notFound();

  return (
    <MoneyScreen
      view={view}
      actions={{
        startUpload: startReceiptUploadAction,
        readReceipt: readReceiptAction,
        saveExpense: saveExpenseAction,
        deleteExpense: deleteExpenseAction,
        linkExpense: linkExpenseAction,
        saveSubscription: saveSubscriptionAction,
        renewSubscription: renewSubscriptionAction,
        cancelSubscription: cancelSubscriptionAction,
      }}
    />
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'money.title');
}
