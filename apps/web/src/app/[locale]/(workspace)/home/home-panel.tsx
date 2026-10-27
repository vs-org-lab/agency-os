import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';

/** A home block: a titled panel with an optional "open" link in its header. */
export function HomePanel({
  id,
  title,
  action,
  className,
  style,
  children,
}: {
  id: string;
  title: string;
  action?: { href: string; label: string };
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      style={style}
      className={cn('rd-rise flex flex-col rounded-lg border border-border bg-surface', className)}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <h2 id={id} className="text-body-sm font-semibold text-text">
          {title}
        </h2>
        {action ? (
          <Link
            href={action.href}
            aria-label={action.label}
            className="flex size-7 items-center justify-center rounded-md text-text-tertiary transition-colors duration-(--duration-fast) hover:bg-surface-muted hover:text-text"
          >
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3.5">{children}</div>
    </section>
  );
}
