'use client';

import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import type { RoomAcademyView, SessionInput } from '@/modules/academy';
import { academyError, linesOf, type AcademyError } from './shared';

export type SaveSession = (
  input: { clientId: string; sessionId?: string } & SessionInput,
) => Promise<{ ok: true; sessionId: string } | { ok: false; code: string }>;

function Choices({
  legend,
  options,
  chosen,
  toggle,
}: {
  legend: string;
  options: { id: string; label: string }[];
  chosen: string[];
  toggle: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-body-sm font-medium text-text">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-text">
        {options.map((option) => (
          <label key={option.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={chosen.includes(option.id)}
              onChange={() => toggle(option.id)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** C-12: records a training session with its people and materials (RF-141). */
export function SessionForm({
  clientId,
  view,
  save,
  onDone,
}: {
  clientId: string;
  view: RoomAcademyView;
  save: SaveSession;
  onDone: () => void;
}) {
  const t = useTranslations('academy.sessions');
  const tAcademy = useTranslations('academy');
  const id = useId();
  const field = (name: string) => `${id}-${name}`;
  const [heldOn, setHeldOn] = useState('');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [summary, setSummary] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [guests, setGuests] = useState('');
  const [materials, setMaterials] = useState<string[]>([]);
  const [error, setError] = useState<AcademyError | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = (list: string[], set: (next: string[]) => void) => (value: string) =>
    set(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  return (
    <form
      aria-label={t('record')}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await save({
            clientId,
            heldOn,
            title: title.trim(),
            durationMinutes: duration ? Number(duration) : null,
            summary: summary.trim(),
            participantIds: participants,
            guests: linesOf(guests),
            materialIds: materials,
          }).catch(() => ({ ok: false as const, code: 'not_found' }));
          if (result.ok) onDone();
          else setError(academyError(result.code));
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('date')}>{t('heldOn')}</Label>
          <Input
            id={field('date')}
            type="date"
            required
            value={heldOn}
            onChange={(event) => setHeldOn(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor={field('title')}>{t('name')}</Label>
          <Input
            id={field('title')}
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={field('duration')}>{t('duration')}</Label>
          <Input
            id={field('duration')}
            type="number"
            min={1}
            max={600}
            inputMode="numeric"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={field('summary')}>{t('summary')}</Label>
        <Textarea
          id={field('summary')}
          rows={3}
          maxLength={2000}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </div>
      <Choices
        legend={`${t('participants')} · ${t('client')}`}
        options={view.people
          .filter((person) => person.side === 'client')
          .map((person) => ({ id: person.id, label: person.name }))}
        chosen={participants}
        toggle={toggle(participants, setParticipants)}
      />
      <Choices
        legend={`${t('participants')} · ${t('team')}`}
        options={view.people
          .filter((person) => person.side === 'team')
          .map((person) => ({ id: person.id, label: person.name }))}
        chosen={participants}
        toggle={toggle(participants, setParticipants)}
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor={field('guests')}>{t('guests')}</Label>
        <Textarea
          id={field('guests')}
          rows={2}
          value={guests}
          onChange={(event) => setGuests(event.target.value)}
        />
      </div>
      <Choices
        legend={t('materials')}
        options={view.items.map((item) => ({ id: item.id, label: item.title }))}
        chosen={materials}
        toggle={toggle(materials, setMaterials)}
      />
      {error ? <FormMessage tone="danger">{tAcademy(`errors.${error}`)}</FormMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {t('save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {tAcademy('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
