import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@agency-os/ui/lib/utils';

function Empty({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty"
      className={cn(
        'group relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-6 py-12 text-center',
        className,
      )}
      {...props}
    />
  );
}

const FAN_CLASSES = {
  left: '-rotate-6 opacity-60 group-hover:-translate-x-1',
  center: '',
  right: 'rotate-6 opacity-60 group-hover:translate-x-1',
} as const;

function EmptyMedia({ icons, className }: { icons: ReactNode[]; className?: string }) {
  const visible = icons.slice(0, 3);
  const fanned = visible.length === 3;
  const positions: (keyof typeof FAN_CLASSES)[] = fanned
    ? ['left', 'center', 'right']
    : visible.map(() => 'center');

  return (
    <div
      data-slot="empty-media"
      className={cn('flex items-center justify-center', fanned ? '-space-x-2' : 'gap-2', className)}
    >
      {visible.map((icon, index) => (
        <div
          // Icons are positional and static, so the index is a stable key.
          key={index}
          className={cn(
            'flex size-10 items-center justify-center rounded-lg border border-border bg-surface-muted text-text-tertiary transition-transform duration-(--duration-morph) [&_svg]:size-5',
            FAN_CLASSES[positions[index] ?? 'center'],
          )}
        >
          {icon}
        </div>
      ))}
    </div>
  );
}

function EmptyTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2 data-slot="empty-title" className={cn('text-title-sm text-text', className)} {...props} />
  );
}

function EmptyDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-description"
      className={cn('max-w-[48ch] text-body text-text-secondary', className)}
      {...props}
    />
  );
}

function EmptyActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty-actions"
      className={cn('mt-2 flex flex-wrap items-center justify-center gap-2', className)}
      {...props}
    />
  );
}

function EmptyRows({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div
      data-slot="empty-rows"
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 px-6 pb-3 [mask-image:linear-gradient(to_bottom,transparent,black_60%)]',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2"
        >
          <div className="size-4 rounded bg-border" />
          <div className="h-2.5 flex-1 rounded bg-border" />
          <div className="h-2.5 w-12 rounded bg-border" />
        </div>
      ))}
    </div>
  );
}

export { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyActions, EmptyRows };
