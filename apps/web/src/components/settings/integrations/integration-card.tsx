import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@agency-os/ui/lib/utils';

export type IntegrationTone = 'active' | 'test' | 'warning' | 'neutral';

const DOT_TONE: Record<IntegrationTone, string> = {
  active: 'bg-success',
  test: 'bg-info',
  warning: 'bg-warning',
  neutral: 'bg-text-tertiary',
};

type IntegrationCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Visible state: the dot colour never carries the meaning alone. */
  status?: { tone: IntegrationTone; label: string };
  /** Static marker for items that do not exist yet. */
  badge?: string;
  note?: string;
  action?: ReactNode;
};

export function IntegrationCard({
  icon: Icon,
  title,
  description,
  status,
  badge,
  note,
  action,
}: IntegrationCardProps) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-text-secondary"
        >
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-title-sm text-text">{title}</h3>
            {status ? (
              <span className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', DOT_TONE[status.tone])}
                />
                {status.label}
              </span>
            ) : null}
            {badge ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-caption text-text-secondary">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="text-body-sm text-text-secondary">{description}</p>
          {note ? <p className="text-caption text-text-tertiary">{note}</p> : null}
        </div>
      </div>
      {action ? <div className="flex gap-2">{action}</div> : null}
    </li>
  );
}
