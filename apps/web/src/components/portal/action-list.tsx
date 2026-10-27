'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
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
 * What the client has to do now. It renders nothing when there is nothing to do, and only the
 * most urgent item carries the solid primary action.
 */
export function ActionList({ items }: { items: PortalActionItem[] }) {
  const t = useTranslations('portal.dashboard.action');
  const format = useFormatter();
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="portal-action" className="flex flex-col gap-3">
      <h2 id="portal-action" className="text-title-sm text-text">
        {t('title')}
      </h2>
      <ul className="flex flex-col gap-2">
        {byUrgency(items).map((item, index) => (
          <li
            key={`${item.kind}:${item.href}:${item.title}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-caption text-text-secondary">{t(`kinds.${item.kind}`)}</span>
              <span className="truncate text-body font-medium text-text">{item.title}</span>
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
    </section>
  );
}
