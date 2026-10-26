import type { ReactNode } from 'react';
import { Skeleton } from '@agency-os/ui/components/skeleton';
import { cn } from '@agency-os/ui/lib/utils';

/** Without a label the skeleton is decorative and hidden from assistive technology. */
type SkeletonProps = { label?: string; className?: string };

function SkeletonRegion({ label, className, children }: SkeletonProps & { children: ReactNode }) {
  const classes = cn('flex flex-col gap-3', className);

  if (label === undefined) {
    return (
      <div aria-hidden="true" className={classes}>
        {children}
      </div>
    );
  }

  return (
    <div role="status" aria-busy="true" className={classes}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

export function SkeletonHeader({
  label,
  actions = false,
  className,
}: SkeletonProps & { actions?: boolean }) {
  return (
    <SkeletonRegion label={label} className={className}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        {actions ? <Skeleton className="h-9 w-28 shrink-0" /> : null}
      </div>
    </SkeletonRegion>
  );
}

export function SkeletonRows({
  label,
  rows = 5,
  columns = 3,
  className,
}: SkeletonProps & { rows?: number; columns?: number }) {
  return (
    <SkeletonRegion label={label} className={className}>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} data-slot="skeleton-row" className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton key={column} className={cn('h-4', column === 0 ? 'w-1/3' : 'w-1/5')} />
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

export function SkeletonCards({ label, count = 6, className }: SkeletonProps & { count?: number }) {
  return (
    <SkeletonRegion label={label} className={className}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            data-slot="skeleton-card"
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

export function SkeletonPanel({ label, className }: SkeletonProps) {
  return (
    <SkeletonRegion label={label} className={className}>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-2 h-24 w-full" />
      </div>
    </SkeletonRegion>
  );
}
