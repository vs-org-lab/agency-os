'use client';

import { useEffect } from 'react';
import { COUNTER_REFRESH_EVENT } from '@/components/shell/navigation-counter';

/**
 * Records the visit from the browser instead of during the server render, so route
 * prefetching never marks applications as seen.
 */
export function MarkApplicationsSeen({ markSeen }: { markSeen: () => Promise<void> }) {
  useEffect(() => {
    markSeen().then(
      () => window.dispatchEvent(new Event(COUNTER_REFRESH_EVENT)),
      () => undefined,
    );
  }, [markSeen]);

  return null;
}
