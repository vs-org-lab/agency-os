'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { SidePanel } from '@agency-os/ui/components/side-panel';
import { DateField } from '@/components/forms/date-field';
import { SelectField } from '@/components/forms/select-field';
import { FormMessage } from '@/components/forms/form-message';
import type { Person, StepView } from '@/modules/rooms';
import type { RoomError } from './room-errors';

export type StepChanges = {
  assigneeId?: string | null;
  dueOn?: string | null;
  visibleToClient?: boolean;
};

/**
 * Side panel with one step's details. Whoever may edit steps changes the assignee, the date and
 * the client visibility here; everyone else reads them.
 */
export function StepPanel({
  step,
  people,
  editable,
  pending,
  error,
  onClose,
  onChange,
}: {
  step: StepView | null;
  people: readonly Person[];
  editable: boolean;
  pending: boolean;
  error: RoomError | null;
  onClose: () => void;
  onChange: (stepId: string, changes: StepChanges) => void;
}) {
  const t = useTranslations('rooms');

  return (
    <SidePanel
      open={step !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={step?.name ?? ''}
      closeLabel={t('step.panelClose')}
    >
      {step ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={step.status === 'done' ? 'secondary' : 'outline'}>
              {t(`stepStatus.${step.status}`)}
            </Badge>
            {step.shared ? <Badge variant="outline">{t('step.shared')}</Badge> : null}
            {step.reopened ? <Badge variant="outline">{t('step.reopened')}</Badge> : null}
          </div>
          {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
          {step.chained ? (
            <p className="text-caption text-text-tertiary">{t('step.chained')}</p>
          ) : null}
          {editable ? (
            <>
              <SelectField
                name="assignee"
                label={t('step.assignee', { name: step.name })}
                value={step.assigneeId ?? ''}
                disabled={pending}
                onValueChange={(assigneeId) =>
                  onChange(step.id, { assigneeId: assigneeId || null })
                }
                options={people.map((person) => ({ value: person.id, label: person.name }))}
                emptyLabel={t('step.unassigned')}
              />
              <DateField
                name="dueOn"
                label={t('step.due', { name: step.name })}
                value={step.dueOn ?? ''}
                disabled={pending}
                onValueChange={(value) => {
                  const dueOn = value || null;
                  if (dueOn !== step.dueOn) onChange(step.id, { dueOn });
                }}
              />
              <label className="flex items-center gap-2 text-body-sm text-text">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={step.visibleToClient}
                  disabled={pending}
                  onChange={(event) => onChange(step.id, { visibleToClient: event.target.checked })}
                />
                {t('step.visible')}
              </label>
            </>
          ) : (
            <p className="text-body-sm text-text-secondary">
              {step.visibleToClient ? t('step.visible') : null}
            </p>
          )}
        </div>
      ) : null}
    </SidePanel>
  );
}
