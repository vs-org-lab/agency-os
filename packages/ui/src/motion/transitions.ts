import type { Transition } from 'motion/react';

const easeOut = [0, 0, 0.2, 1] as const;

export const transitions = {
  fast: { type: 'tween', ease: easeOut, duration: 0.12 },
  base: { type: 'tween', ease: easeOut, duration: 0.18 },
  slow: { type: 'tween', ease: easeOut, duration: 0.24 },
  morph: { type: 'spring', duration: 0.3, bounce: 0 },
} as const satisfies Record<string, Transition>;
