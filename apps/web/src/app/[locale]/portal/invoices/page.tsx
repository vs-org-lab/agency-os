import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { FormMessage } from '@/components/forms/form-message';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { cardPaymentsEnabled, loadPortalInvoices } from '@/modules/billing/server';
import { payByCardAction } from './actions';
import { InvoiceCard } from './invoice-card';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ paid?: string }>;
};

const PAYING_ROLES = ['decision_maker', 'client_finance'];

export default async function PortalInvoicesPage({ params, searchParams }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const [clientId, roles = []] = [...session.ctx.clientRoles.entries()][0] ?? [];
  const pays = roles.some((role) => PAYING_ROLES.includes(role));
  const invoices = clientId && pays ? await loadPortalInvoices(session.claims, clientId) : [];
  const t = await getTranslations('portal.invoices');
  const returnedFromCheckout = (await searchParams).paid === '1';

  if (invoices.length === 0) {
    return <EmptyState title={t('title')} description={t('empty')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-title text-text">{t('title')}</h1>
        <p className="text-body-sm text-text-secondary">{t('intro')}</p>
      </header>
      {returnedFromCheckout ? <FormMessage tone="success">{t('confirming')}</FormMessage> : null}
      <ul className="flex flex-col gap-4">
        {invoices.map((invoice) => (
          <li key={invoice.id}>
            <InvoiceCard
              invoice={invoice}
              cardEnabled={cardPaymentsEnabled()}
              pay={payByCardAction}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
