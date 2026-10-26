'use client';

import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import { motionFeatures } from './features';
import { transitions } from './transitions';

/**
 * Features load synchronously: loading them later updates the LazyMotion context during hydration,
 * which makes React drop server HTML of pending streamed boundaries and render them again on the
 * client.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={motionFeatures} strict>
      <MotionConfig reducedMotion="user" transition={transitions.base}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
