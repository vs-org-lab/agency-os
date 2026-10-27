'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { useTaskParams } from './use-task-params';

/** "Minhas": the tasks assigned to the reader, through the same `assignee` param as the select. */
export function MineFilter({
  userId,
  assigneeId,
  controls,
}: {
  userId: string;
  assigneeId: string | null;
  controls: string;
}) {
  const t = useTranslations('tasks.filters');
  const setParams = useTaskParams();
  const active = assigneeId === userId;

  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'outline'}
      aria-pressed={active}
      aria-controls={controls}
      onClick={() => setParams({ assignee: active ? null : userId, new: null })}
    >
      {t('mine')}
    </Button>
  );
}
