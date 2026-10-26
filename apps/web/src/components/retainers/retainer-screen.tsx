'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { ClipboardList } from 'lucide-react';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { CreateDialog } from '@/components/ui/create-dialog';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import type { StaffRetainerView } from '@/modules/retainers';
import { ExtraRequests, type QuoteExtra } from './extra-requests';
import { LimitRings } from './limit-rings';
import { RetainerForm, type SaveRetainer } from './retainer-form';
import { retainerError, useQuantity, type RetainerError, type RetainerResult } from './shared';
import { UsageForm, type RecordUsage } from './usage-form';

export type RetainerActions = {
  saveRetainer: SaveRetainer;
  recordUsage: RecordUsage;
  deleteUsage: (usageId: string) => Promise<RetainerResult>;
  quoteExtra: QuoteExtra;
};

function refreshing<A extends unknown[]>(
  run: (...args: A) => Promise<RetainerResult>,
  refresh: () => void,
): (...args: A) => Promise<RetainerResult> {
  return async (...args) => {
    const result = await run(...args);
    if (result.ok) refresh();
    return result;
  };
}

function UsageList({
  view,
  remove,
}: {
  view: StaffRetainerView;
  remove: RetainerActions['deleteUsage'];
}) {
  const t = useTranslations('retainers');
  const quantity = useQuantity();
  const [error, setError] = useState<RetainerError | null>(null);
  const [pending, startTransition] = useTransition();
  if (view.usage.length === 0) {
    return <EmptyState icon={<ClipboardList aria-hidden />} title={t('usage.empty')} />;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col">
        {view.usage.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0"
          >
            <span className="text-body-sm text-text">
              {t('usage.line', {
                quantity: quantity(entry.quantity),
                kind: t(`kinds.${entry.kind}`),
                description: entry.description,
              })}
            </span>
            <span className="flex items-center gap-2">
              {entry.extra ? <Badge variant="outline">{t('usage.extra')}</Badge> : null}
              {view.canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-label={t('usage.deleteEntry', { description: entry.description })}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await remove(entry.id).catch(() => ({
                        ok: false as const,
                        code: 'not_found',
                      }));
                      setError(result.ok ? null : retainerError(result.code));
                    })
                  }
                >
                  {t('usage.delete')}
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
    </div>
  );
}

/** C-10: the retainer's month for the room, with its usage and extra requests. */
export function RetainerScreen({
  clientId = '',
  view,
  actions,
}: {
  clientId?: string;
  view: StaffRetainerView;
  actions: RetainerActions;
}) {
  const t = useTranslations('retainers');
  const format = useFormatter();
  const router = useRouter();
  const refresh = () => router.refresh();
  const [editing, setEditing] = useState(false);
  const retainer = view.retainer;
  const monthLabel = format.dateTime(new Date(`${view.month}T12:00:00Z`), {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-title-sm text-text">{t('title')}</h2>
          {retainer ? (
            <p className="text-body text-text-secondary">
              {t('summary', {
                tier: retainer.tier,
                date: format.dateTime(new Date(`${retainer.reviewOn}T12:00:00Z`), {
                  dateStyle: 'long',
                }),
              })}
            </p>
          ) : null}
          {retainer?.monthlyFee ? (
            <p className="text-body-sm text-text-secondary">
              {t('fee', {
                fee: format.number(Number(retainer.monthlyFee), {
                  style: 'currency',
                  currency: retainer.currency,
                }),
              })}
            </p>
          ) : null}
        </div>
        {retainer && view.canWrite ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing((open) => !open)}
          >
            {editing ? t('cancel') : t('edit')}
          </Button>
        ) : null}
      </header>

      {!retainer ? <p className="text-body-sm text-text-secondary">{t('empty')}</p> : null}
      {view.canWrite && (!retainer || editing) ? (
        <RetainerForm
          clientId={clientId}
          view={view}
          save={refreshing(actions.saveRetainer, refresh)}
          onDone={() => setEditing(false)}
        />
      ) : null}

      {retainer ? (
        <>
          <section className="flex flex-col gap-3" aria-label={t('month', { month: monthLabel })}>
            <h3 className="text-body font-medium text-text">{t('month', { month: monthLabel })}</h3>
            <LimitRings limits={view.limits} />
          </section>
          <section className="flex flex-col gap-3" aria-label={t('usage.list')}>
            <h3 className="text-body font-medium text-text">{t('usage.list')}</h3>
            {view.canWrite && retainer.status === 'active' ? (
              <div>
                <CreateDialog label={t('usage.title')} title={t('usage.title')} variant="outline">
                  {(close) => (
                    <UsageForm
                      retainerId={retainer.id}
                      limits={view.limits}
                      record={refreshing(actions.recordUsage, refresh)}
                      onDone={(message) => close({ message })}
                    />
                  )}
                </CreateDialog>
              </div>
            ) : null}
            <UsageList view={view} remove={refreshing(actions.deleteUsage, refresh)} />
          </section>
          <section className="flex flex-col gap-3" aria-label={t('extras.title')}>
            <h3 className="text-body font-medium text-text">{t('extras.title')}</h3>
            <ExtraRequests
              extras={view.extraRequests}
              canWrite={view.canWrite}
              quote={refreshing(actions.quoteExtra, refresh)}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
