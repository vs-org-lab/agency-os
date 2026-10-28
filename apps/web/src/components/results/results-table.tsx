'use client';

import { useState, useTransition } from 'react';
import { Pencil, Upload } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { cn } from '@agency-os/ui/lib/utils';
import { HoldToConfirm } from '@/components/ui/hold-to-confirm';
import { notify } from '@/components/ui/notify';
import {
  monthsUpTo,
  parseNumber,
  type ClientKpiView,
  type ClientResultsView,
  type KpiValuesInput,
  type ResultsActionResult,
  formatKpi,
} from '@/modules/results';
import { CsvImportPanel } from './csv-import-panel';
import { EMPTY_KPI, KpiFormDialog, type KpiDraft } from './kpi-form-dialog';

export type ResultsActions = {
  saveKpi: Parameters<typeof KpiFormDialog>[0]['save'];
  archiveKpi: (kpiId: string) => Promise<ResultsActionResult>;
  recordValues: (input: KpiValuesInput) => Promise<ResultsActionResult>;
};

const draftOf = (kpi: ClientKpiView): KpiDraft => ({
  kpiId: kpi.id,
  name: kpi.name,
  format: kpi.format,
  aggregation: kpi.aggregation,
  source: kpi.source,
  target: kpi.target === null ? '' : String(kpi.target),
  clientVisible: kpi.clientVisible,
});

/** One value of an indicator in a month, edited in place. */
function ValueCell({
  kpi,
  label,
  value,
  current,
  onSave,
}: {
  kpi: ClientKpiView;
  label: string;
  value: number | null;
  current: boolean;
  onSave: (value: number) => Promise<boolean>;
}) {
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [pending, startTransition] = useTransition();

  const commit = () => {
    const parsed = parseNumber(text);
    if (parsed === null || parsed === value) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      if (await onSave(parsed)) setEditing(false);
    });
  };

  if (editing) {
    return (
      <input
        aria-label={label}
        autoFocus
        inputMode="decimal"
        value={text}
        disabled={pending}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setEditing(false);
        }}
        className="h-8 w-24 rounded-md border border-text bg-canvas px-2 text-right text-body-sm text-text tabular-nums shadow-[0_0_0_3px_color-mix(in_oklab,var(--text)_12%,transparent)] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        setText(value === null ? '' : String(value).replace('.', locale === 'en' ? '.' : ','));
        setEditing(true);
      }}
      className={cn(
        'h-8 min-w-20 rounded-md px-2 text-right text-body-sm tabular-nums transition-colors duration-(--duration-fast) hover:bg-surface-muted',
        value === null
          ? 'text-text-tertiary'
          : current
            ? 'font-medium text-text'
            : 'text-text-secondary',
      )}
    >
      {value === null ? '—' : formatKpi(value, kpi.format, locale)}
    </button>
  );
}

/** Sala › Resultados: indicators by month, with inline entry, editing and CSV import. */
export function ResultsTable({
  clientId,
  view,
  actions,
}: {
  clientId: string;
  view: ClientResultsView;
  actions: ResultsActions;
}) {
  const t = useTranslations('results');
  const format = useFormatter();
  const locale = useLocale();
  const months = monthsUpTo(view.currentMonth, 4);
  const [dialog, setDialog] = useState<KpiDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const [, startTransition] = useTransition();
  const monthLabel = (month: string) =>
    format.dateTime(new Date(`${month}T12:00:00Z`), { month: 'long' });

  const save = async (kpi: ClientKpiView, month: string, value: number) => {
    const result = await actions.recordValues({
      clientId,
      origin: 'manual',
      values: [{ kpiId: kpi.id, month, value }],
    });
    if (result.ok) notify.success(t('table.saved'));
    else notify.error(t('form.errors.not_found'));
    return result.ok;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setDialog(EMPTY_KPI)}>
          {t('form.create')}
        </Button>
        <Button onClick={() => setImporting(true)} disabled={view.kpis.length === 0}>
          <Upload aria-hidden />
          {t('import.open')}
        </Button>
      </div>

      <section className="rd-rise overflow-x-auto rounded-lg border border-border bg-surface">
        {view.kpis.length === 0 ? (
          <p className="px-4 py-6 text-body-sm text-text-secondary">{t('table.empty')}</p>
        ) : (
          <table aria-label={t('table.label')} className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-caption font-medium text-text-tertiary">
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  {t('table.kpi')}
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  {t('table.source')}
                </th>
                {months.map((month) => (
                  <th
                    key={month}
                    scope="col"
                    className={cn(
                      'px-3 py-2.5 text-right font-medium capitalize',
                      month === view.currentMonth && 'text-text',
                    )}
                  >
                    {monthLabel(month)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  {t('table.target')}
                </th>
                <th scope="col" className="w-40 px-3 py-2.5">
                  <span className="sr-only">{t('form.editTitle')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.kpis.map((kpi) => {
                const byMonth = new Map(kpi.values.map((point) => [point.month, point.value]));
                const latest = byMonth.get(view.currentMonth) ?? null;
                const met = kpi.target !== null && latest !== null && latest >= kpi.target;
                return (
                  <tr key={kpi.id} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <span className="flex flex-col">
                        <span className="flex items-center gap-2 text-body-sm font-medium text-text">
                          {kpi.name}
                          {kpi.clientVisible ? null : (
                            <span className="rounded-full bg-neutral-bg px-1.5 text-caption font-normal text-text-secondary">
                              {t('table.hidden')}
                            </span>
                          )}
                        </span>
                        <span className="text-caption text-text-tertiary">
                          {t(`aggregationHint.${kpi.aggregation}`)}
                        </span>
                      </span>
                    </th>
                    <td className="px-3 py-2 text-body-sm text-text-secondary">
                      {kpi.source || t('table.manual')}
                    </td>
                    {months.map((month) => (
                      <td key={month} className="px-1 py-1.5 text-right">
                        <ValueCell
                          kpi={kpi}
                          current={month === view.currentMonth}
                          value={byMonth.get(month) ?? null}
                          label={t('table.cell', { name: kpi.name, month: monthLabel(month) })}
                          onSave={(value) => save(kpi, month, value)}
                        />
                      </td>
                    ))}
                    <td
                      className={cn(
                        'px-3 py-2 text-right text-body-sm tabular-nums',
                        met ? 'text-success' : 'text-text-secondary',
                      )}
                    >
                      {kpi.target === null ? '—' : formatKpi(kpi.target, kpi.format, locale)}
                      {met ? ' ✓' : ''}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('table.edit', { name: kpi.name })}
                          onClick={() => setDialog(draftOf(kpi))}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <HoldToConfirm
                          label={t('table.archiveShort')}
                          ariaLabel={t('table.archive', { name: kpi.name })}
                          onConfirm={() =>
                            startTransition(async () => {
                              const result = await actions.archiveKpi(kpi.id);
                              if (result.ok) notify.success(t('form.archived'));
                            })
                          }
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <KpiFormDialog
        clientId={clientId}
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        initial={dialog ?? EMPTY_KPI}
        save={actions.saveKpi}
      />
      <CsvImportPanel
        clientId={clientId}
        kpis={view.kpis}
        currentMonth={view.currentMonth}
        open={importing}
        onOpenChange={setImporting}
        recordValues={actions.recordValues}
      />
    </div>
  );
}
