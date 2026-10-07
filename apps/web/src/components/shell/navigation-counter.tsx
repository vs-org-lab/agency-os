'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from '@/i18n/navigation';

export const COUNTER_REFRESH_EVENT = 'navigation-counters:refresh';

const MAX_DISPLAYED = 9;

export function formatCounter(count: number): string | null {
  if (count <= 0) return null;
  return count > MAX_DISPLAYED ? `${MAX_DISPLAYED}+` : String(count);
}

/**
 * The shell layout renders once and persists across client navigations, so a server-rendered
 * count would go stale. The counter starts from the server value and refreshes after each
 * navigation, when the window regains focus and when a screen announces a change.
 */
export function useLiveCounter(initial: number, refresh: () => Promise<number>): number {
  const [count, setCount] = useState(initial);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const update = () => {
      refreshRef.current().then(setCount, () => undefined);
    };
    window.addEventListener('focus', update);
    window.addEventListener(COUNTER_REFRESH_EVENT, update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener(COUNTER_REFRESH_EVENT, update);
    };
  }, []);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    refreshRef.current().then(setCount, () => undefined);
  }, [pathname]);

  return count;
}
