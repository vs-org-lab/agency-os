import * as React from 'react';
import { cn } from '@agency-os/ui/lib/utils';

type DynamicIslandStatus = 'idle' | 'recording' | 'paused' | 'working' | 'done' | 'error';

type DynamicIslandProps = {
  status: DynamicIslandStatus;
  label: string;
  /** A running time such as "01:23". */
  timer?: string;
  /** Controls shown next to the state, such as pause and stop. */
  actions?: React.ReactNode;
  className?: string;
};

const DOT: Record<DynamicIslandStatus, string> = {
  idle: 'bg-neutral',
  recording: 'bg-danger motion-safe:animate-pulse',
  paused: 'bg-warning',
  working: 'bg-brand',
  done: 'bg-success',
  error: 'bg-danger',
};

/** A compact status pill that announces what a recorder is doing and carries its controls. */
function DynamicIsland({ status, label, timer, actions, className }: DynamicIslandProps) {
  return (
    <div
      data-slot="dynamic-island"
      data-status={status}
      role="status"
      aria-live="polite"
      className={cn(
        'bg-surface border-border text-text inline-flex max-w-full items-center gap-3 rounded-full border py-1.5 pr-2 pl-4 shadow-sm',
        className,
      )}
    >
      <span
        data-slot="dynamic-island-dot"
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-full', DOT[status])}
      />
      <span className="text-sm font-medium">{label}</span>
      {timer ? <span className="text-text-secondary text-sm tabular-nums">{timer}</span> : null}
      {actions ? <span className="flex items-center gap-1">{actions}</span> : null}
    </div>
  );
}

export { DynamicIsland };
export type { DynamicIslandProps, DynamicIslandStatus };
