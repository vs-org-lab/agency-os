'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@agency-os/ui/lib/utils';
import { Link, usePathname } from '@/i18n/navigation';

export type TaskViewMode = 'list' | 'board';

export function parseTaskView(value: string | undefined): TaskViewMode {
  return value === 'board' ? 'board' : 'list';
}

/** List and board as links that keep the client and assignee filters of the address. */
export function TaskViewSwitch({ view }: { view: TaskViewMode }) {
  const t = useTranslations('tasks.views');
  const pathname = usePathname();
  const current = useSearchParams().toString();

  const hrefOf = (option: TaskViewMode) => {
    const params = new URLSearchParams(current);
    params.delete('task');
    if (option === 'board') {
      params.set('view', 'board');
      params.delete('status');
    } else {
      params.delete('view');
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return (
    <nav aria-label={t('label')} className="inline-flex rounded-md bg-surface-muted p-0.5">
      {(['list', 'board'] as const).map((option) => (
        <Link
          key={option}
          href={hrefOf(option)}
          aria-current={view === option ? 'page' : undefined}
          className={cn(
            'rounded-sm px-3 py-1.5 text-body-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
            view === option
              ? 'bg-surface text-text shadow-xs'
              : 'text-text-secondary hover:text-text',
          )}
        >
          {t(option)}
        </Link>
      ))}
    </nav>
  );
}
