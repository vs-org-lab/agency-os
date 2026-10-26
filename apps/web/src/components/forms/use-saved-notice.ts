'use client';

import { useEffect, useRef } from 'react';

/**
 * Reports a saved `useActionState` result to `onDone` exactly once. Each result is a new object,
 * so its identity (not its status) decides whether it was already reported; this keeps strict-mode
 * effect replays and unrelated re-renders from firing the callback twice.
 */
export function useSavedNotice(
  state: { status: string },
  onDone: ((message: string) => void) | undefined,
  message: string,
): void {
  const reported = useRef<object | null>(null);

  useEffect(() => {
    if (state.status !== 'saved' || reported.current === state) return;
    reported.current = state;
    onDone?.(message);
  }, [state, onDone, message]);
}
