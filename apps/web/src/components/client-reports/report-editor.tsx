'use client';

import { useId, useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { Link, useRouter } from '@/i18n/navigation';
import type { ClientReportView, ReportTexts } from '@/modules/client-reports';
import { reportError, usePeriodLabel, useShortDate, type ReportResult } from './shared';

export type ReportEditorActions = {
  save: (input: { reportId: string; texts: ReportTexts }) => Promise<ReportResult>;
  share: (input: { reportId: string }) => Promise<ReportResult>;
};

const TEXT_MAX = 2000;
const TEXT_KEYS = ['summary', 'highlights', 'priorities', 'nextSteps'] as const;

function DataSection({ title, lines }: { title: string; lines: string[] }) {
  const t = useTranslations('clientReports');
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-body-sm font-medium text-text">{title}</h4>
      {lines.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-body-sm text-text">
          {lines.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PeriodData({ view }: { view: ClientReportView }) {
  const t = useTranslations('clientReports');
  const format = useFormatter();
  const shortDate = useShortDate();
  const periodLabel = usePeriodLabel();
  const number = (value: number | string) =>
    format.number(Number(value), { maximumFractionDigits: 2 });
  const dated = (entries: { on: string; text: string }[]) =>
    entries.map((entry) => `${shortDate(entry.on)} · ${entry.text}`);
  const { data } = view;
  const id = useId();

  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id={id} className="text-body font-medium text-text">
          {t('generated')}
        </h3>
        <p className="text-body-sm text-text-secondary">{t('generatedHint')}</p>
      </div>
      <DataSection
        title={t('sections.steps')}
        lines={dated(data.steps.map((step) => ({ on: step.on, text: step.name })))}
      />
      <DataSection
        title={t('sections.updates')}
        lines={dated(data.updates.map((update) => ({ on: update.on, text: update.title })))}
      />
      <DataSection
        title={t('sections.approvals')}
        lines={dated(data.approvals.map((item) => ({ on: item.on, text: item.title })))}
      />
      {data.retainer ? (
        <DataSection
          title={t('sections.retainer')}
          lines={data.retainer.flatMap((month) =>
            month.limits.map(
              (limit) =>
                `${data.retainer && data.retainer.length > 1 ? `${periodLabel('monthly', month.month)} · ` : ''}${t(
                  'limitUsage',
                  {
                    kind: t(`limits.${limit.kind}`),
                    used: number(limit.used),
                    available: number(limit.available),
                  },
                )}`,
            ),
          )}
        />
      ) : null}
      {data.outcome ? (
        <DataSection
          title={`${t('sections.outcome')} · ${data.outcome.metric}`}
          lines={[
            t('outcomeSummary', {
              baseline: number(data.outcome.baseline),
              target: number(data.outcome.target),
              deadline: shortDate(data.outcome.deadline),
            }),
            ...dated(
              data.outcome.measurements.map((entry) => ({
                on: entry.on,
                text: number(entry.value),
              })),
            ),
          ]}
        />
      ) : null}
    </section>
  );
}

/** C-14 editor: the period's data, the team's texts, the PDF preview and the share. */
export function ReportEditor({
  view,
  actions,
}: {
  view: ClientReportView;
  actions: ReportEditorActions;
}) {
  const t = useTranslations('clientReports');
  const router = useRouter();
  const periodLabel = usePeriodLabel();
  const shortDate = useShortDate();
  const id = useId();
  const [texts, setTexts] = useState<ReportTexts>(view.texts);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const keys = TEXT_KEYS.filter((key) => key !== 'priorities' || view.period.kind === 'qbr');

  const run = (action: () => Promise<ReportResult>, done: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false as const, code: 'not_found' }));
      if (result.ok) {
        setMessage(done);
        router.refresh();
      } else setMessage(`errors.${reportError(result.code)}`);
    });
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href={`/c/${view.clientId}/reports`} className="text-body-sm text-link">
            {t('back')}
          </Link>
          <h2 className="text-title-sm text-text">
            {t('item', {
              kind: t(`kinds.${view.period.kind}`),
              period: periodLabel(view.period.kind, view.period.start),
            })}
          </h2>
          <p className="text-body-sm text-text-secondary">
            {view.status === 'shared' && view.sharedAt
              ? t('status.shared', { date: shortDate(view.sharedAt) })
              : t('status.draft')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {view.documentId ? (
            <Link
              href={`/c/${view.clientId}/docs/${view.documentId}`}
              className="text-body-sm text-link"
            >
              {t('viewDocument')}
            </Link>
          ) : null}
          {view.canWrite ? (
            <a
              href={`/api/client-reports/${view.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="text-body-sm text-link"
            >
              {t('preview')}
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <PeriodData view={view} />
        <form
          className="flex flex-col gap-4"
          aria-label={t('texts.title')}
          onSubmit={(event) => {
            event.preventDefault();
            run(() => actions.save({ reportId: view.id, texts }), 'saved');
          }}
        >
          {view.canWrite ? null : <FormMessage tone="info">{t('readOnly')}</FormMessage>}
          {keys.map((key) => (
            <div key={key} className="flex flex-col gap-1">
              <Label htmlFor={`${id}-${key}`}>{t(`texts.${key}`)}</Label>
              <Textarea
                id={`${id}-${key}`}
                value={texts[key]}
                maxLength={TEXT_MAX}
                readOnly={!view.canWrite}
                rows={4}
                onChange={(event) => setTexts({ ...texts, [key]: event.target.value })}
              />
            </div>
          ))}
          {message ? (
            <FormMessage tone={message.startsWith('errors.') ? 'danger' : 'success'}>
              {message === 'saved'
                ? t('saved')
                : message === 'shared'
                  ? t('sharedNow')
                  : t(message as `errors.${ReturnType<typeof reportError>}`)}
            </FormMessage>
          ) : null}
          {view.canWrite ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                {t('save')}
              </Button>
              {confirming ? null : (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirming(true)}
                >
                  {t('share')}
                </Button>
              )}
            </div>
          ) : null}
          {view.canWrite && confirming ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <p className="text-body-sm text-text">{t('shareConfirm')}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setConfirming(false);
                    run(async () => {
                      const saved = await actions.save({ reportId: view.id, texts });
                      return saved.ok ? actions.share({ reportId: view.id }) : saved;
                    }, 'shared');
                  }}
                >
                  {t('confirmShare')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                >
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
