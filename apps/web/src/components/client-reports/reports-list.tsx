'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { Link, useRouter } from '@/i18n/navigation';
import type { ClientReportsView, ReportKind } from '@/modules/client-reports';
import { reportError, SELECT, usePeriodLabel, useShortDate, type ReportError } from './shared';

export type CreateReport = (input: {
  clientId: string;
  kind: ReportKind;
  periodStart: string;
}) => Promise<{ ok: true; reportId: string } | { ok: false; code: string }>;

function NewReport({
  clientId,
  periods,
  create,
}: {
  clientId: string;
  periods: ClientReportsView['periods'];
  create: CreateReport;
}) {
  const t = useTranslations('clientReports');
  const router = useRouter();
  const periodLabel = usePeriodLabel();
  const id = useId();
  const [kind, setKind] = useState<ReportKind>('monthly');
  const [periodStart, setPeriodStart] = useState(periods.monthly[0] ?? '');
  const [error, setError] = useState<ReportError | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
      aria-label={t('newReport')}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await create({ clientId, kind, periodStart }).catch(() => ({
            ok: false as const,
            code: 'not_found',
          }));
          if (result.ok) router.push(`/c/${clientId}/reports/${result.reportId}`);
          else setError(reportError(result.code));
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-kind`}>{t('kind')}</Label>
        <select
          id={`${id}-kind`}
          value={kind}
          className={SELECT}
          onChange={(event) => {
            const next = event.target.value as ReportKind;
            setKind(next);
            setPeriodStart(periods[next][0] ?? '');
          }}
        >
          <option value="monthly">{t('kinds.monthly')}</option>
          <option value="qbr">{t('kinds.qbr')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-period`}>{t('period')}</Label>
        <select
          id={`${id}-period`}
          value={periodStart}
          className={SELECT}
          onChange={(event) => setPeriodStart(event.target.value)}
        >
          {periods[kind].map((start) => (
            <option key={start} value={start}>
              {periodLabel(kind, start)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending || !periodStart}>
        {t('create')}
      </Button>
      {error ? (
        <div className="basis-full">
          <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage>
        </div>
      ) : null}
    </form>
  );
}

/** C-14: the client's monthly reports and QBRs, newest period first. */
export function ReportsList({
  clientId,
  view,
  create,
}: {
  clientId: string;
  view: ClientReportsView;
  create: CreateReport;
}) {
  const t = useTranslations('clientReports');
  const periodLabel = usePeriodLabel();
  const shortDate = useShortDate();

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-title-sm text-text">{t('title')}</h2>
        <p className="text-body-sm text-text-secondary">{t('intro')}</p>
      </header>
      {view.canWrite ? (
        <NewReport clientId={clientId} periods={view.periods} create={create} />
      ) : null}
      {view.reports.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {view.reports.map((report) => (
            <li
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <Link
                href={`/c/${clientId}/reports/${report.id}`}
                className="text-body font-medium text-link"
              >
                {t('item', {
                  kind: t(`kinds.${report.kind}`),
                  period: periodLabel(report.kind, report.periodStart),
                })}
              </Link>
              <span className="text-body-sm text-text-secondary">
                {report.status === 'shared' && report.sharedAt
                  ? t('status.shared', { date: shortDate(report.sharedAt) })
                  : t('status.draft')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
