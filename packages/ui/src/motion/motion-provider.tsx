'use client';

import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import { transitions } from './transitions';

/** Layout and shared-element animations need the full feature set; it loads after first paint. */
export const loadMotionFeatures = () => import('./features').then((module) => module.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user" transition={transitions.base}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
