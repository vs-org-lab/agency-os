'use client';

import NumberFlow, { type Format } from '@number-flow/react';
import { cn } from '@agency-os/ui/lib/utils';
import { useReducedMotion } from '@agency-os/ui/motion';

type AnimatedNumberProps = {
  value: number;
  locale: string;
  format?: Format;
  className?: string;
};

/** Number that rolls to its new value; the first render and reduced-motion users get no animation. */
export function AnimatedNumber({ value, locale, format, className }: AnimatedNumberProps) {
  const reducedMotion = useReducedMotion();

  return (
    <NumberFlow
      value={value}
      locales={locale}
      format={format}
      animated={!reducedMotion}
      className={cn('tabular-nums', className)}
    />
  );
}
