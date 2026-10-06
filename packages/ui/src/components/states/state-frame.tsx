import type { ReactNode } from 'react';
import { cn } from '@agency-os/ui/lib/utils';

export type StateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function StateFrame({
  title,
  description,
  action,
  icon,
  className,
  role,
  busy,
}: StateProps & { role?: 'alert' | 'status'; busy?: boolean }) {
  return (
    <div
      role={role}
      aria-busy={busy || undefined}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="text-text-tertiary [&_svg]:size-5">{icon}</div> : null}
      <h2 className="text-title-sm text-text">{title}</h2>
      {description ? (
        <p className="max-w-[48ch] text-body text-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
