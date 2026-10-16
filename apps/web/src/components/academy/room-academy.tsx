'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { AcademyItemStatus } from '@agency-os/db';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import { useRouter } from '@/i18n/navigation';
import type { RoomAcademyItem, RoomAcademyView, TrainingSessionView } from '@/modules/academy';
import { ItemForm, type SaveItem } from './item-form';
import { SessionForm, type SaveSession } from './session-form';
import { StepCheck } from './step-check';
import { academyError, useShortDate, type AcademyResult } from './shared';

export type RoomAcademyActions = {
  saveItem: SaveItem;
  setStatus: (input: { itemId: string; status: AcademyItemStatus }) => Promise<AcademyResult>;
  deleteItem: (input: { itemId: string }) => Promise<AcademyResult>;
  moveItem: (input: { itemId: string; direction: 'up' | 'down' }) => Promise<AcademyResult>;
  checkStep: (input: { stepId: string; done: boolean }) => Promise<AcademyResult>;
  saveSession: SaveSession;
  deleteSession: (input: { sessionId: string }) => Promise<AcademyResult>;
};

export function SessionList({
  sessions,
  onDelete,
}: {
  sessions: TrainingSessionView[];
  /** Given to the room's writers only. */
  onDelete?: (sessionId: string) => void;
}) {
  const t = useTranslations('academy.sessions');
  const shortDate = useShortDate();
  if (sessions.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('empty')}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
      {sessions.map((session) => (
        <li key={session.id} className="flex flex-col gap-1 px-4 py-3">
          <p className="text-body font-medium text-text">{session.title}</p>
          <p className="text-body-sm text-text-secondary">
            {[
              shortDate(session.heldOn),
              session.durationMinutes ? t('minutes', { minutes: session.durationMinutes }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {session.summary ? <p className="text-body-sm text-text">{session.summary}</p> : null}
          {session.participants.length > 0 ? (
            <p className="text-body-sm text-text-secondary">
              {t('with', { names: session.participants.map((person) => person.name).join(', ') })}
            </p>
          ) : null}
          {session.materials.length > 0 ? (
            <p className="text-body-sm text-text-secondary">
              {t('used', { titles: session.materials.map((item) => item.title).join(', ') })}
            </p>
          ) : null}
          {onDelete ? <DeleteSession onDelete={() => onDelete(session.id)} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** A session goes with its participants and materials, so deleting it asks first. */
function DeleteSession({ onDelete }: { onDelete: () => void }) {
  const t = useTranslations('academy');
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => setConfirming(true)}
      >
        {t('sessions.delete')}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
        {t('actions.confirmDelete')}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        {t('actions.cancel')}
      </Button>
    </div>
  );
}

function ItemCard({
  clientId,
  item,
  first,
  last,
  view,
  actions,
  run,
  pending,
}: {
  clientId: string;
  item: RoomAcademyItem;
  first: boolean;
  last: boolean;
  view: RoomAcademyView;
  actions: RoomAcademyActions;
  run: (action: () => Promise<AcademyResult>) => void;
  pending: boolean;
}) {
  const t = useTranslations('academy');
  const shortDate = useShortDate();
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  if (editing) {
    return (
      <ItemForm
        clientId={clientId}
        files={view.files}
        item={item}
        save={actions.saveItem}
        onDone={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-body-sm text-text-secondary">{t(`kinds.${item.kind}`)}</p>
          <h3 id={titleId} className="text-body font-medium text-text">
            {item.title}
          </h3>
        </div>
        <Badge variant={item.status === 'published' ? 'default' : 'outline'}>
          {t(`status.${item.status}`)}
        </Badge>
      </header>
      {item.description ? <p className="text-body-sm text-text">{item.description}</p> : null}
      {item.kind !== 'checklist' ? (
        <p className="text-body-sm text-text-secondary">
          {item.url ?? item.file?.name ?? t('noMaterial')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-text-secondary">
            {t('progress', { done: item.progress.done, total: item.progress.total })}
          </p>
          <ul className="flex flex-col gap-1">
            {item.steps.map((step) => (
              <li
                key={step.id}
                className="flex flex-wrap items-center gap-2 text-body-sm text-text"
              >
                <StepCheck
                  id={`${titleId}-${step.id}`}
                  text={step.text}
                  done={step.done}
                  disabled={!view.canWrite}
                  change={async (done) => {
                    const result = await actions
                      .checkStep({ stepId: step.id, done })
                      .catch(() => ({ ok: false as const }));
                    if (result.ok) router.refresh();
                  }}
                />
                {step.done && step.checkedBy && step.checkedAt ? (
                  <span className="text-text-secondary">
                    {t('checkedBy', { name: step.checkedBy, date: shortDate(step.checkedAt) })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={item.status === 'published' ? 'outline' : 'default'}
            disabled={pending}
            onClick={() =>
              run(() =>
                actions.setStatus({
                  itemId: item.id,
                  status: item.status === 'published' ? 'draft' : 'published',
                }),
              )
            }
          >
            {item.status === 'published' ? t('actions.withdraw') : t('actions.publish')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            {t('actions.edit')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || first}
            onClick={() => run(() => actions.moveItem({ itemId: item.id, direction: 'up' }))}
          >
            {t('actions.up')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || last}
            onClick={() => run(() => actions.moveItem({ itemId: item.id, direction: 'down' }))}
          >
            {t('actions.down')}
          </Button>
          {confirming ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => actions.deleteItem({ itemId: item.id }))}
              >
                {t('actions.confirmDelete')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                {t('actions.cancel')}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              {t('actions.delete')}
            </Button>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** C-12: the client's academy and training sessions (RF-140, RF-141). */
export function RoomAcademy({
  clientId,
  view,
  actions,
}: {
  clientId: string;
  view: RoomAcademyView;
  actions: RoomAcademyActions;
}) {
  const t = useTranslations('academy');
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sessionsId = useId();

  const run = (action: () => Promise<AcademyResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false as const, code: 'not_found' }));
      if (result.ok) router.refresh();
      else setError(academyError(result.code));
    });
  };

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-title-sm text-text">{t('title')}</h2>
          <p className="text-body-sm text-text-secondary">{t('intro')}</p>
        </div>
        {view.canWrite && !creating ? (
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            {t('actions.newItem')}
          </Button>
        ) : null}
      </header>
      {error ? (
        <FormMessage tone="danger">{t(`errors.${error as 'not_found'}`)}</FormMessage>
      ) : null}
      {creating ? (
        <ItemForm
          clientId={clientId}
          files={view.files}
          save={actions.saveItem}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}
      {view.items.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {view.items.map((item, index) => (
            <ItemCard
              key={item.id}
              clientId={clientId}
              item={item}
              first={index === 0}
              last={index === view.items.length - 1}
              view={view}
              actions={actions}
              run={run}
              pending={pending}
            />
          ))}
        </div>
      )}

      <section aria-labelledby={sessionsId} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={sessionsId} className="text-body font-medium text-text">
            {t('sessions.title')}
          </h2>
          {view.canWrite && !recording ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setRecording(true)}>
              {t('sessions.record')}
            </Button>
          ) : null}
        </div>
        {recording ? (
          <SessionForm
            clientId={clientId}
            view={view}
            save={actions.saveSession}
            onDone={() => {
              setRecording(false);
              router.refresh();
            }}
          />
        ) : null}
        <SessionList
          sessions={view.sessions}
          {...(view.canWrite
            ? { onDelete: (sessionId: string) => run(() => actions.deleteSession({ sessionId })) }
            : {})}
        />
      </section>
    </div>
  );
}
