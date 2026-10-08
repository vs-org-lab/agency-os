'use client';

import { useActionState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { RoadmapLane } from '@agency-os/db';
import { Badge } from '@agency-os/ui/components/badge';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { MIN_INTERNAL_ITEMS } from '@/modules/diagnosis';
import { crossReviewAction } from './actions';

const LANES: readonly RoadmapLane[] = ['days_30', 'days_90', 'months_12'];

type RoadmapItem = { id: string; title: string; owner: 'internal' | 'aurion' };

export function RoadmapSection({
  roadmap,
  internalItems,
}: {
  roadmap: Record<RoadmapLane, RoadmapItem[]>;
  internalItems: number;
}) {
  const t = useTranslations('diagnosis');
  return (
    <section
      aria-labelledby="core-roadmap-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
        <h2 id="core-roadmap-title" className="text-title-sm text-text">
          {t('roadmap.title')}
        </h2>
        <span
          className={
            internalItems >= MIN_INTERNAL_ITEMS
              ? 'text-body-sm text-text-secondary'
              : 'text-body-sm text-warning'
          }
        >
          {t('roadmap.internalCount', { count: internalItems, min: MIN_INTERNAL_ITEMS })}
        </span>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        {LANES.map((lane) => (
          <div key={lane} className="flex flex-col gap-2 rounded-md bg-surface-muted p-3">
            <h3 className="text-label text-text">{t(`lanes.${lane}`)}</h3>
            {roadmap[lane].length === 0 ? (
              <p className="text-caption text-text-secondary">{t('roadmap.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {roadmap[lane].map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-md bg-surface p-2"
                  >
                    <span className="text-body-sm text-text">{item.title}</span>
                    <Badge variant="outline">{t(`owners.${item.owner}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CrossReviewSection({
  engagementId,
  dealId,
  review,
  writable,
}: {
  engagementId: string;
  dealId: string;
  review: { at: Date; notes: string | null } | null;
  writable: boolean;
}) {
  const t = useTranslations('diagnosis.crossReview');
  const format = useFormatter();
  const [state, formAction] = useActionState(crossReviewAction.bind(null, engagementId, dealId), {
    status: 'idle',
  });

  return (
    <section
      aria-labelledby="core-review-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 id="core-review-title" className="text-title-sm text-text">
          {t('title')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('description')}</p>
        {review ? (
          <p className="text-body-sm text-success">
            {t('recorded', { date: format.dateTime(review.at, { dateStyle: 'medium' }) })}
          </p>
        ) : null}
      </header>
      {writable ? (
        <form action={formAction} className="flex flex-col gap-2">
          <Label htmlFor="core-review-notes">{t('notes')}</Label>
          <Textarea
            id="core-review-notes"
            name="notes"
            rows={3}
            maxLength={5000}
            defaultValue={review?.notes ?? ''}
          />
          {state.status === 'warning' ? (
            <FormMessage tone="warning">{t('sameAuthor')}</FormMessage>
          ) : null}
          {state.status === 'error' ? (
            <FormMessage tone="danger">{t(`errors.${state.code}` as never)}</FormMessage>
          ) : null}
          <div className="md:w-56">
            <SubmitButton>{t('record')}</SubmitButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}
