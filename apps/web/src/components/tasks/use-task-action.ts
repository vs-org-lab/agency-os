'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { notify } from '@/components/ui/notify';
import { taskError, type TaskActionResult } from './task-errors';

/**
 * Runs a task action, telling the reader why when it is refused. Resolves to whether it
 * succeeded; `pending` is true while any run is in flight.
 */
export function useTaskAction() {
  const t = useTranslations('tasks.errors');
  const [inFlight, setInFlight] = useState(0);

  const run = useCallback(
    async (action: () => Promise<TaskActionResult>): Promise<boolean> => {
      setInFlight((count) => count + 1);
      try {
        const result = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
        if (!result.ok) notify.error(t(taskError(result.code)));
        return result.ok;
      } finally {
        setInFlight((count) => count - 1);
      }
    },
    [t],
  );

  return { run, pending: inFlight > 0 };
}
