'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';

/** Sets or removes search params in one navigation, keeping every other param of the address. */
export function useTaskParams(): (changes: Record<string, string | null>) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.toString();

  return useCallback(
    (changes) => {
      const next = new URLSearchParams(current);
      for (const [param, value] of Object.entries(changes)) {
        if (value === null) next.delete(param);
        else next.set(param, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [current, pathname, router],
  );
}
