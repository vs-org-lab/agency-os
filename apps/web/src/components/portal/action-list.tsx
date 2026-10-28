'use client';

import { CheckCircle2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';

export type PortalActionKind = 'approval' | 'proof' | 'proposal' | 'contract' | 'payment';

export type PortalActionItem = {
  kind: PortalActionKind;
  title: string;
  dueOn: string | null;
  href: string;
};

/** Items with a due date come first, earliest first; the rest keep the order they came in. */
function byUrgency(items: PortalActionItem[]): PortalActionItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.dueOn && b.item.dueOn) {
        return a.item.dueOn.localeCompare(b.item.dueOn) || a.index - b.index;
      }
      if (a.item.dueOn) return -1;
      if (b.item.dueOn) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * What the client has to do now, the most urgent first with the solid primary action. With
 * nothing to do it says so, so the client knows nothing is waiting on them.
 */
export function ActionList({ items }: { items: PortalActionItem[] }) {
  const t = useTranslations('portal.dashboard.action');
  const format = useFormatter();

  return (
    <section
      aria-labelledby="portal-action"
      data-tour="actions"
      className="rd-rise flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className={cn('size-1.5 rounded-full', items.length > 0 ? 'bg-warning' : 'bg-success')}
        />
        <h2 id="portal-action" className="text-body-sm font-semibold text-text">
          {t('title')}
        </h2>
        {items.length > 0 ? (
          <span className="text-caption text-text-tertiary tabular-nums">{items.length}</span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="flex flex-1 items-center gap-2 px-4 py-6 text-body-sm text-text-secondary">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {byUrgency(items).map((item, index) => (
            <li
              key={`${item.kind}:${item.href}:${item.title}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-caption text-text-secondary">{t(`kinds.${item.kind}`)}</span>
                <span className="truncate text-body-sm font-medium text-text">{item.title}</span>
                {item.dueOn ? (
                  <span className="text-caption text-text-tertiary">
                    {t('due', {
                      date: format.dateTime(new Date(`${item.dueOn}T12:00:00Z`), {
                        dateStyle: 'medium',
                      }),
                    })}
                  </span>
                ) : null}
              </div>
              <Button asChild size="sm" variant={index === 0 ? 'default' : 'outline'}>
                <Link href={item.href}>{t(`cta.${item.kind}`)}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
