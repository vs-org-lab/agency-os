'use client';

import { cn } from '@agency-os/ui/lib/utils';
import { m, useReducedMotion } from '@agency-os/ui/motion';

type ThinkingOrbsProps = {
  label: string;
  className?: string;
};

const ORB_DELAYS = [0, 0.18, 0.36] as const;

/** Generation-in-progress indicator; reduced motion collapses it to one static dot. */
function ThinkingOrbs({ label, className }: ThinkingOrbsProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      data-slot="thinking-orbs"
      data-motion={reducedMotion ? 'static' : 'animated'}
      role="status"
      className={cn('inline-flex items-center gap-2 text-body-sm text-text-secondary', className)}
    >
      <span aria-hidden="true" className="flex h-4 items-center gap-1">
        {reducedMotion ? (
          <span data-orb className="size-2 rounded-full bg-brand" />
        ) : (
          ORB_DELAYS.map((delay) => (
            <m.span
              key={delay}
              data-orb
              className="size-2 rounded-full bg-brand"
              animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 0.9, ease: 'easeInOut', repeat: Infinity, delay }}
            />
          ))
        )}
      </span>
      <span>{label}</span>
    </div>
  );
}

export { ThinkingOrbs };
