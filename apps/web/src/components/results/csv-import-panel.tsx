'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { SidePanel } from '@agency-os/ui/components/side-panel';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import { notify } from '@/components/ui/notify';
import {
  aggregateMonthly,
  detectDateColumn,
  detectSource,
  parseCsv,
  type ClientKpiView,
  type CsvTable,
  type MonthlyValue,
  type KpiValuesInput,
  type ResultsActionResult,
} from '@/modules/results';
import { formatKpi } from './kpi-format';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 20_000;
const BATCH = 500;
const FILE_BADGE = 'CSV';
const NO_COLUMN = '—';

type Step = 'file' | 'columns' | 'review';
type ImportError = 'tooLarge' | 'empty' | 'noDate' | 'nothing' | 'failed';
type Loaded = { name: string; table: CsvTable; source: string };

const STEPS: Step[] = ['file', 'columns', 'review'];

const selectClass =
  'h-9 w-full rounded-md border border-border-strong bg-surface px-2.5 text-body-sm text-text';

/** Importing a source export: pick the file, link its columns to indicators, review, save. */
export function CsvImportPanel({
  clientId,
  kpis,
  currentMonth,
  open,
  onOpenChange,
  recordValues,
}: {
  clientId: string;
  kpis: readonly ClientKpiView[];
  currentMonth: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordValues: (input: KpiValuesInput) => Promise<ResultsActionResult>;
}) {
  const t = useTranslations('results.import');
  const format = useFormatter();
  const locale = useLocale();
  const id = useId();
  const [step, setStep] = useState<Step>('file');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [dateColumn, setDateColumn] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [error, setError] = useState<ImportError | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setStep('file');
    setLoaded(null);
    setDateColumn(null);
    setMapping({});
    setError(null);
  };

  const monthLabel = (month: string) =>
    format.dateTime(new Date(`${month}T12:00:00Z`), { month: 'short', year: 'numeric' });

  const read = async (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) return setError('tooLarge');
    const table = parseCsv(await file.text());
    if (table.headers.length < 2 || table.rows.length === 0) return setError('empty');
    if (table.rows.length > MAX_ROWS) return setError('tooLarge');
    const date = detectDateColumn(table.headers);
    const byName = new Map(kpis.map((kpi) => [kpi.name.trim().toLowerCase(), kpi.id]));
    const guessed: Record<number, string> = {};
    table.headers.forEach((header, index) => {
      const match = byName.get(header.trim().toLowerCase());
      if (match && index !== date) guessed[index] = match;
    });
    setLoaded({ name: file.name, table, source: detectSource(table.headers) });
    setDateColumn(date);
    setMapping(guessed);
    setStep('columns');
  };

  const linked = useMemo(() => {
    if (!loaded || dateColumn === null) return [];
    return Object.entries(mapping)
      .filter(([, kpiId]) => kpiId !== '')
      .map(([column, kpiId]) => {
        const kpi = kpis.find((entry) => entry.id === kpiId);
        if (!kpi) return null;
        const monthly = aggregateMonthly(
          loaded.table.rows,
          dateColumn,
          Number(column),
          kpi.aggregation,
        ).filter((entry) => entry.month <= currentMonth);
        return { column: Number(column), kpi, monthly };
      })
      .filter((entry): entry is { column: number; kpi: ClientKpiView; monthly: MonthlyValue[] } =>
        Boolean(entry),
      );
  }, [loaded, dateColumn, mapping, kpis, currentMonth]);

  const valueCount = linked.reduce((sum, entry) => sum + entry.monthly.length, 0);

  const toReview = () => {
    if (dateColumn === null) return setError('noDate');
    if (valueCount === 0) return setError('nothing');
    setError(null);
    setStep('review');
  };

  const confirm = () =>
    startTransition(async () => {
      const values = linked.flatMap((entry) =>
        entry.monthly.map((point) => ({
          kpiId: entry.kpi.id,
          month: point.month,
          value: point.value,
        })),
      );
      for (let start = 0; start < values.length; start += BATCH) {
        const result = await recordValues({
          clientId,
          origin: 'csv',
          values: values.slice(start, start + BATCH),
        });
        if (!result.ok) {
          setError('failed');
          return;
        }
      }
      notify.success(t('done', { count: values.length }));
      reset();
      onOpenChange(false);
    });

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t('title')}
      closeLabel={t('back')}
    >
      <div className="flex flex-col gap-5">
        <ol aria-label={t('title')} className="grid grid-cols-3 gap-1.5">
          {STEPS.map((entry, index) => {
            const position = STEPS.indexOf(step);
            return (
              <li
                key={entry}
                aria-current={entry === step ? 'step' : undefined}
                className={cn(
                  'flex flex-col gap-1.5 text-caption',
                  index <= position ? 'text-text' : 'text-text-tertiary',
                  entry === step && 'font-medium',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-[3px] rounded-full transition-colors duration-(--duration-base)',
                    index <= position ? 'bg-text' : 'bg-border',
                  )}
                />
                {t('stepLabel', { position: index + 1, name: t(`steps.${entry}`) })}
              </li>
            );
          })}
        </ol>

        {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}

        {step === 'file' ? (
          <div className="flex flex-col gap-3">
            <label
              htmlFor={`${id}-file`}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center transition-colors duration-(--duration-fast) hover:bg-surface-muted"
            >
              <FileSpreadsheet aria-hidden className="size-6 text-text-tertiary" />
              <span className="text-body-sm font-medium text-text">{t('drop')}</span>
            </label>
            <input
              id={`${id}-file`}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void read(file);
                event.target.value = '';
              }}
            />
            <p className="text-caption text-text-secondary">{t('dropHint')}</p>
          </div>
        ) : null}

        {step === 'columns' && loaded ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border border-border bg-canvas px-3 py-2.5">
              <span className="flex size-8 items-center justify-center rounded-md bg-surface-muted text-[10px] font-semibold text-text-secondary">
                {FILE_BADGE}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm font-medium text-text">{loaded.name}</span>
                <span className="text-caption text-text-tertiary">
                  {t('detected', { rows: loaded.table.rows.length, source: loaded.source })}
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                {t('change')}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-date`}>{t('dateColumn')}</Label>
              <select
                id={`${id}-date`}
                className={selectClass}
                value={dateColumn ?? ''}
                onChange={(event) =>
                  setDateColumn(event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">{NO_COLUMN}</option>
                {loaded.table.headers.map((header, index) => (
                  <option key={header + index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-caption font-medium text-text-tertiary">{t('mapping')}</span>
              {loaded.table.headers.map((header, index) =>
                index === dateColumn ? null : (
                  <div key={header + index} className="grid grid-cols-[1fr_1fr] items-center gap-2">
                    <Label htmlFor={`${id}-col-${index}`} className="truncate font-normal">
                      {header}
                    </Label>
                    <select
                      id={`${id}-col-${index}`}
                      className={selectClass}
                      value={mapping[index] ?? ''}
                      onChange={(event) =>
                        setMapping((current) => ({ ...current, [index]: event.target.value }))
                      }
                    >
                      <option value="">{t('ignore')}</option>
                      {kpis.map((kpi) => (
                        <option key={kpi.id} value={kpi.id}>
                          {kpi.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              )}
            </div>
            <p className="text-caption text-text-secondary">{t('aggregationNote')}</p>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={reset}>
                {t('back')}
              </Button>
              <Button onClick={toReview} disabled={valueCount === 0}>
                {t('next', { count: valueCount })}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="flex flex-col gap-4">
            <p className="text-body-sm text-text-secondary">{t('reviewIntro')}</p>
            {linked.map((entry) => {
              const existing = new Map(entry.kpi.values.map((point) => [point.month, point.value]));
              return (
                <section
                  key={entry.column}
                  aria-label={entry.kpi.name}
                  className="flex flex-col gap-1"
                >
                  <h3 className="text-body-sm font-semibold text-text">{entry.kpi.name}</h3>
                  <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                    {entry.monthly.map((point) => {
                      const before = existing.get(point.month);
                      return (
                        <li
                          key={point.month}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-body-sm"
                        >
                          <span className="text-text-secondary capitalize">
                            {monthLabel(point.month)}
                          </span>
                          <span className="flex items-baseline gap-2">
                            <span className="font-medium text-text tabular-nums">
                              {formatKpi(point.value, entry.kpi.format, locale)}
                            </span>
                            <span className="text-caption text-text-tertiary">
                              {before === undefined
                                ? t('new')
                                : t('replaces', {
                                    value: formatKpi(before, entry.kpi.format, locale),
                                  })}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('columns')}>
                {t('back')}
              </Button>
              <Button onClick={confirm} disabled={pending}>
                {t('confirm')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </SidePanel>
  );
}
