'use client';

import * as React from 'react';
import { cn } from '@agency-os/ui/lib/utils';
import { useReducedMotion } from '@agency-os/ui/motion';

type ScrambleTextProps = {
  text: string;
  /** Total reveal time in milliseconds. */
  duration?: number;
  className?: string;
};

const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const FRAME_MS = 30;

function scrambled(text: string, revealed: number): string {
  return Array.from(text, (char, index) =>
    char === ' ' || index < revealed ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!,
  ).join('');
}

/** Reveals a short heading once on mount. Assistive technology only receives the final text. */
function ScrambleText({ text, duration = 600, className }: ScrambleTextProps) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = React.useState(text);

  React.useEffect(() => {
    if (reducedMotion) {
      setDisplay(text);
      return;
    }
    const startedAt = Date.now();
    const tick = () => {
      const progress = Math.min((Date.now() - startedAt) / duration, 1);
      setDisplay(progress >= 1 ? text : scrambled(text, Math.floor(progress * text.length)));
      if (progress >= 1) window.clearInterval(timer);
    };
    const timer = window.setInterval(tick, FRAME_MS);
    tick();
    return () => window.clearInterval(timer);
  }, [text, duration, reducedMotion]);

  return (
    <span data-slot="scramble-text" className={className}>
      <span aria-live="polite" className="sr-only">
        {text}
      </span>
      <span aria-hidden="true" className={cn('tabular-nums')}>
        {display}
      </span>
    </span>
  );
}

export { ScrambleText };
