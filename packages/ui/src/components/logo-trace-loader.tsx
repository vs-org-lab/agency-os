'use client';

import { BRAND_SYMBOL_PATHS, BRAND_SYMBOL_VIEW_BOX } from '@agency-os/ui/brand';
import { cn } from '@agency-os/ui/lib/utils';
import { m, transitions, useReducedMotion } from '@agency-os/ui/motion';

/** The studio monogram drawn stroke by stroke; reduced motion shows it finished and still. */
function LogoTraceLoader({ className }: { className?: string }) {
  const reducedMotion = useReducedMotion();

  return (
    <svg
      data-slot="logo-trace-loader"
      data-motion={reducedMotion ? 'static' : 'animated'}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={BRAND_SYMBOL_VIEW_BOX}
      aria-hidden="true"
      className={cn('size-14 text-text', className)}
    >
      {BRAND_SYMBOL_PATHS.map((d, index) =>
        reducedMotion ? (
          <path key={d} d={d} fill="currentColor" />
        ) : (
          <m.path
            key={d}
            d={d}
            pathLength={1}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeDasharray={1}
            initial={{ strokeDashoffset: 1, fillOpacity: 0 }}
            animate={{ strokeDashoffset: 0, fillOpacity: 1 }}
            transition={{
              ...transitions.slow,
              delay: index * 0.12,
              repeat: Infinity,
              repeatType: 'reverse',
              repeatDelay: 0.4,
            }}
          />
        ),
      )}
    </svg>
  );
}

export { LogoTraceLoader };
