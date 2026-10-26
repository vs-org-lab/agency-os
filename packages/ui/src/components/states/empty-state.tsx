import type { ReactNode } from 'react';
import { cn } from '@agency-os/ui/lib/utils';
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyRows, EmptyTitle } from './empty';
import type { StateProps } from './state-frame';

type EmptyStateProps = StateProps & {
  icons?: ReactNode[];
  variant?: 'plain' | 'rows';
};

export function EmptyState({
  title,
  description,
  action,
  icon,
  icons,
  variant = 'plain',
  className,
}: EmptyStateProps) {
  const media = icons ?? (icon ? [icon] : []);

  return (
    <Empty className={cn(variant === 'rows' && 'pb-28', className)}>
      {media.length > 0 ? <EmptyMedia icons={media} /> : null}
      <EmptyTitle>{title}</EmptyTitle>
      {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      {action ? <EmptyActions>{action}</EmptyActions> : null}
      {variant === 'rows' ? <EmptyRows /> : null}
    </Empty>
  );
}
