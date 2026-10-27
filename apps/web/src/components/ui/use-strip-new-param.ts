'use client';

import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';

/** Returns a function that drops `?new=1` from the address once its overlay has been dealt with. */
export function useStripNewParam(): () => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return () => {
    if (!searchParams.has('new')) return;
    const rest = new URLSearchParams(searchParams);
    rest.delete('new');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
}
