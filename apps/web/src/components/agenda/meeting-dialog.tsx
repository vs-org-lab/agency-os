'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agency-os/ui/components/dialog';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import {
  lisbonDay,
  lisbonInstant,
  lisbonTime,
  MEETING_KINDS,
  type AgendaItem,
  type MeetingKind,
} from '@/modules/agenda';

export type ActionResult = { ok: true } | { ok: false; code: string };

export type AgendaActions = {
  schedule: (input: Record<string, unknown>) => Promise<ActionResult>;
  update: (input: { eventId: string } & Record<string, unknown>) => Promise<ActionResult>;
  cancel: (eventId: string) => Promise<ActionResult>;
};

export type DialogTarget = { mode: 'new'; day: string } | { mode: 'edit'; item: AgendaItem };

type MeetingError = 'not_found' | 'invalid_input' | 'invalid_state';

function meetingError(code: string): MeetingError {
  return code === 'invalid_input' || code === 'invalid_state' ? code : 'not_found';
}

const SELECT =
  'h-9 rounded-md border border-border bg-surface px-2 text-body-sm text-text disabled:opacity-60';

/** Nova reunião or Editar reunião, in Lisbon time; a past meeting opens read-only. */
export function MeetingDialog({
  target,
  onClose,
  onDone,
  clients,
  projects,
  fixedClientId,
  actions,
}: {
  target: DialogTarget;
  onClose: () => void;
  onDone: (notice: 'scheduled' | 'updated' | 'cancelled') => void;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string }[];
  fixedClientId: string | null;
  actions: AgendaActions;
}) {
  const t = useTranslations('agenda');
  const id = useId();
  const editing = target.mode === 'edit' ? target.item : null;
  const meeting = editing?.meeting;
  const readOnly = editing !== null && !meeting?.editable;
  const [kind, setKind] = useState<MeetingKind>(
    meeting?.kind ?? (fixedClientId ? 'meeting' : clients.length > 0 ? 'meeting' : 'internal'),
  );
  const [clientId, setClientId] = useState<string>(
    editing?.clientId ?? fixedClientId ?? clients[0]?.id ?? '',
  );
  const [projectId, setProjectId] = useState<string>(editing?.projectId ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [day, setDay] = useState(
    editing?.startsAt
      ? lisbonDay(new Date(editing.startsAt))
      : target.mode === 'new'
        ? target.day
        : '',
  );
  const [start, setStart] = useState(
    editing?.startsAt ? lisbonTime(new Date(editing.startsAt)) : '10:00',
  );
  const [end, setEnd] = useState(editing?.endsAt ? lisbonTime(new Date(editing.endsAt)) : '11:00');
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [invite, setInvite] = useState(meeting?.inviteClient ?? false);
  const [error, setError] = useState<MeetingError | null>(null);
  const [pending, startTransition] = useTransition();
  const internal = kind === 'internal';
  const clientProjects = projects.filter((project) => project.clientId === clientId);
  const kinds = MEETING_KINDS.filter((value) =>
    fixedClientId || editing?.clientId
      ? value !== 'internal'
      : value === 'internal' || clients.length > 0,
  );

  const input = () => ({
    kind,
    clientId: internal ? null : clientId || null,
    projectId: internal || !projectId ? null : projectId,
    title,
    notes,
    location,
    startsAt: day ? lisbonInstant(day, start).toISOString() : '',
    endsAt: day ? lisbonInstant(day, end).toISOString() : '',
    inviteClient: internal ? false : invite,
  });

  const run = (
    action: () => Promise<ActionResult>,
    notice: 'scheduled' | 'updated' | 'cancelled',
  ) =>
    startTransition(async () => {
      const outcome = await action().catch(() => ({ ok: false, code: 'not_found' }) as const);
      if (outcome.ok) onDone(notice);
      else setError(meetingError(outcome.code));
    });

  const field = (name: string) => `${id}-${name}`;
  const heading = readOnly
    ? t('dialog.viewTitle')
    : editing
      ? t('dialog.editTitle')
      : t('dialog.newTitle');

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent closeLabel={t('dialog.close')} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (readOnly) return;
            if (editing) run(() => actions.update({ eventId: editing.id, ...input() }), 'updated');
            else run(() => actions.schedule(input()), 'scheduled');
          }}
        >
          <fieldset disabled={readOnly || pending} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={field('kind')}>{t('dialog.kind')}</Label>
                <select
                  id={field('kind')}
                  value={kind}
                  disabled={editing !== null}
                  onChange={(event) => setKind(event.target.value as MeetingKind)}
                  className={SELECT}
                >
                  {kinds.map((value) => (
                    <option key={value} value={value}>
                      {t(`meetingKinds.${value}`)}
                    </option>
                  ))}
                </select>
              </div>
              {!internal && !fixedClientId ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={field('client')}>{t('dialog.client')}</Label>
                  <select
                    id={field('client')}
                    value={clientId}
                    disabled={editing !== null}
                    onChange={(event) => {
                      setClientId(event.target.value);
                      setProjectId('');
                    }}
                    className={SELECT}
                  >
                    <option value="">{t('dialog.chooseClient')}</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            {!internal ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={field('project')}>{t('dialog.project')}</Label>
                <select
                  id={field('project')}
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className={SELECT}
                >
                  <option value="">{t('dialog.noProject')}</option>
                  {clientProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor={field('title')}>{t('dialog.title')}</Label>
              <Input
                id={field('title')}
                value={title}
                maxLength={120}
                required
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={field('date')}>{t('dialog.date')}</Label>
                <Input
                  id={field('date')}
                  type="date"
                  value={day}
                  required
                  onChange={(event) => setDay(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={field('start')}>{t('dialog.start')}</Label>
                <Input
                  id={field('start')}
                  type="time"
                  value={start}
                  required
                  onChange={(event) => setStart(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={field('end')}>{t('dialog.end')}</Label>
                <Input
                  id={field('end')}
                  type="time"
                  value={end}
                  required
                  onChange={(event) => setEnd(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={field('location')}>{t('dialog.location')}</Label>
              <Input
                id={field('location')}
                value={location}
                maxLength={500}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={field('notes')}>{t('dialog.notes')}</Label>
              <Textarea
                id={field('notes')}
                value={notes}
                maxLength={2000}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            {!internal ? (
              <label className="flex items-center gap-2 text-body-sm text-text">
                <input
                  type="checkbox"
                  checked={invite}
                  onChange={(event) => setInvite(event.target.checked)}
                />
                {t('dialog.invite')}
              </label>
            ) : null}
          </fieldset>
          {meeting?.syncStatus === 'failed' ? (
            <FormMessage tone="warning">{t('dialog.notSynced')}</FormMessage>
          ) : null}
          {error ? <FormMessage tone="danger">{t(`errors.${error}`)}</FormMessage> : null}
          <DialogFooter className="flex flex-wrap gap-2">
            {meeting?.meetUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={meeting.meetUrl} target="_blank" rel="noopener noreferrer">
                  {t('dialog.openMeet')}
                </a>
              </Button>
            ) : null}
            {editing && !readOnly ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => actions.cancel(editing.id), 'cancelled')}
              >
                {t('dialog.cancelMeeting')}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('dialog.close')}
            </Button>
            {!readOnly ? (
              <Button type="submit" size="sm" disabled={pending}>
                {t('dialog.save')}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
