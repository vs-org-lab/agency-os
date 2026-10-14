'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import type { MoneyRequestRow } from '@/modules/money';
import { useMoneyFormat } from './money-summary';

/** The payment requests sent in the year, with their legal invoice when recorded. */
export function RequestsTable({ requests }: { requests: MoneyRequestRow[] }) {
  const t = useTranslations('money.requests');
  const money = useMoneyFormat();
  if (requests.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('empty')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-body-sm">
        <thead>
          <tr className="border-b border-border text-start text-caption text-text-secondary">
            <th className="py-2 pe-3 text-start font-medium">{t('number')}</th>
            <th className="py-2 pe-3 text-start font-medium">{t('client')}</th>
            <th className="py-2 pe-3 text-end font-medium">{t('amount')}</th>
            <th className="py-2 pe-3 text-start font-medium">{t('status')}</th>
            <th className="py-2 text-start font-medium">{t('legalInvoice')}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id} className="border-b border-border last:border-b-0">
              <td className="py-2 pe-3 font-mono text-caption text-text">{request.number}</td>
              <td className="py-2 pe-3 text-text">{request.clientName}</td>
              <td className="py-2 pe-3 text-end tabular-nums text-text">
                {money(request.amount, request.currency)}
              </td>
              <td className="py-2 pe-3">
                <Badge variant={request.status === 'paid' ? 'secondary' : 'outline'}>
                  {t(`statuses.${request.status}`)}
                </Badge>
              </td>
              <td className="py-2 text-text-secondary">{request.legalInvoiceNumber ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
