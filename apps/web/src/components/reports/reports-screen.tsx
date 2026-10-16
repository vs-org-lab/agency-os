'use client';

import { useId, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { PipelineStage } from '@/modules/commercial';
import type { ReportPanel, ReportsView } from '@/modules/reports';

const MONTH_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'] as const;

const CELL = 'py-2 pe-3 text-start font-medium';
const NUMBER = 'py-2 pe-3 text-end tabular-nums';

function Panel({
  panel,
  year,
  empty,
  children,
}: {
  panel: ReportPanel;
  year: number;
  empty: string | null;
  children: ReactNode;
}) {
  const t = useTranslations('reports');
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-body font-medium text-text">
          {t(`panels.${panel}`)}
        </h2>
        <a href={`/api/reports/${panel}.csv?year=${year}`} className="text-body-sm text-link">
          {t('download')}
        </a>
      </div>
      {empty ? (
        <p className="text-body-sm text-text-secondary">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-body-sm">{children}</table>
        </div>
      )}
    </section>
  );
}

/** S-11 (RF-131): the founder's six panels for a year, each with its CSV. */
export function ReportsScreen({ view }: { view: ReportsView }) {
  const t = useTranslations('reports');
  const format = useFormatter();
  const money = (amount: string, currency: string) =>
    format.number(Number(amount), { style: 'currency', currency });
  const months = MONTH_KEYS.map((key) => t(`months.${key}`));
  const stage = (value: PipelineStage) => t(`stages.${value}`);

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title text-text">{t('title')}</h1>
        <nav aria-label={t('year', { year: view.year })} className="flex items-center gap-3">
          <Link href={`/reports?year=${view.year - 1}`} className="text-body-sm text-link">
            {t('previousYear')}
          </Link>
          <span className="text-body-sm font-medium text-text">
            {t('year', { year: view.year })}
          </span>
          <Link href={`/reports?year=${view.year + 1}`} className="text-body-sm text-link">
            {t('nextYear')}
          </Link>
        </nav>
        <a href={`/api/reports/pdf?year=${view.year}`} className="text-body-sm text-link">
          {t('downloadPdf')}
        </a>
      </header>

      <Panel panel="revenue" year={view.year} empty={view.revenue.length ? null : t('emptyYear')}>
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th scope="col" className={CELL}>
              {t('columns.currency')}
            </th>
            {months.map((month) => (
              <th key={month} scope="col" className={`${NUMBER} font-medium`}>
                {month}
              </th>
            ))}
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.revenue.map((row) => (
            <tr key={row.currency} className="border-b border-border last:border-b-0">
              <th scope="row" className={CELL}>
                {row.currency}
              </th>
              {row.months.map((amount, index) => (
                <td key={index} className={NUMBER}>
                  {money(amount, row.currency)}
                </td>
              ))}
              <td className={`${NUMBER} font-medium`}>{money(row.total, row.currency)}</td>
            </tr>
          ))}
        </tbody>
      </Panel>

      <Panel panel="recurring" year={view.year} empty={view.recurring.length ? null : t('empty')}>
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th scope="col" className={CELL}>
              {t('columns.currency')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.monthly')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.retainers')}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.recurring.map((row) => (
            <tr key={row.currency} className="border-b border-border last:border-b-0">
              <th scope="row" className={CELL}>
                {row.currency}
              </th>
              <td className={NUMBER}>{money(row.monthly, row.currency)}</td>
              <td className={NUMBER}>{row.retainers}</td>
            </tr>
          ))}
        </tbody>
      </Panel>

      <Panel panel="pipeline" year={view.year} empty={view.pipeline.length ? null : t('empty')}>
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th scope="col" className={CELL}>
              {t('columns.stage')}
            </th>
            <th scope="col" className={CELL}>
              {t('columns.code')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.deals')}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.pipeline.flatMap((group) =>
            group.codes.map((code) => (
              <tr key={code.code} className="border-b border-border last:border-b-0">
                <td className="py-2 pe-3">{stage(group.stage)}</td>
                <th scope="row" className={CELL}>
                  {code.code}
                </th>
                <td className={NUMBER}>{code.deals}</td>
              </tr>
            )),
          )}
        </tbody>
      </Panel>

      <Panel panel="conversion" year={view.year} empty={null}>
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th scope="col" className={CELL}>
              {t('columns.passage')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.entered')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.passed')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.conversion')}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.conversion.map((row) => (
            <tr key={row.from} className="border-b border-border last:border-b-0">
              <th scope="row" className={CELL}>
                {t('passage', { from: stage(row.from), to: stage(row.to) })}
              </th>
              <td className={NUMBER}>{row.entered}</td>
              <td className={NUMBER}>{row.passed}</td>
              <td className={NUMBER}>
                {row.percent === null ? t('noPercent') : t('percent', { value: row.percent })}
              </td>
            </tr>
          ))}
        </tbody>
      </Panel>

      <Panel panel="load" year={view.year} empty={view.load.length ? null : t('empty')}>
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th scope="col" className={CELL}>
              {t('columns.member')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.tasks')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.projects')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.hours')}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.load.map((row) => (
            <tr key={row.userId} className="border-b border-border last:border-b-0">
              <th scope="row" className={CELL}>
                {row.name}
              </th>
              <td className={NUMBER}>{row.tasksThisWeek}</td>
              <td className={NUMBER}>{row.activeProjects}</td>
              <td className={NUMBER}>{row.weeklyHours ?? t('noPercent')}</td>
            </tr>
          ))}
        </tbody>
      </Panel>

      <Panel panel="at-risk" year={view.year} empty={view.atRisk.length ? null : t('empty')}>
        <thead>
          <tr className="border-b border-border text-text-secondary">
            <th scope="col" className={CELL}>
              {t('columns.client')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.score')}
            </th>
            <th scope="col" className={`${NUMBER} font-medium`}>
              {t('columns.before')}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.atRisk.map((row) => (
            <tr key={row.clientId} className="border-b border-border last:border-b-0">
              <th scope="row" className={CELL}>
                <Link href={`/c/${row.clientId}`} className="text-link">
                  {row.name}
                </Link>
              </th>
              <td className={NUMBER}>{row.score}</td>
              <td className={NUMBER}>{row.scoreBefore ?? t('noPercent')}</td>
            </tr>
          ))}
        </tbody>
      </Panel>
    </div>
  );
}
