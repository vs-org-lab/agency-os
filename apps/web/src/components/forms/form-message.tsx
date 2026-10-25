import type { ReactNode } from 'react';
import { cn } from '@agency-os/ui/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const toneClasses: Record<Tone, string> = {
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
};

export function FormMessage({
  tone,
  id,
  children,
}: {
  tone: Tone;
  id?: string;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-md px-3 py-2 text-body-sm', toneClasses[tone])}
    >
      {children}
    </p>
  );
}
