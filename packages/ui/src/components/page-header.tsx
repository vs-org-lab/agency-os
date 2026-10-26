import type { ReactNode } from 'react';
import { cn } from '@agency-os/ui/lib/utils';

type PageHeaderProps = {
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
  className?: string;
};

export function PageHeader({
  title,
  description,
  context,
  actions,
  headingLevel = 1,
  className,
}: PageHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <header
      data-slot="page-header"
      className={cn('flex flex-col gap-3 md:flex-row md:items-start md:justify-between', className)}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Heading className="text-title text-text">{title}</Heading>
        {description ? <p className="text-body text-text-secondary">{description}</p> : null}
        {context ? <div className="flex flex-wrap items-center gap-2 pt-1">{context}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
