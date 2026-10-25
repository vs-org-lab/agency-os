'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { cn } from '@agency-os/ui/lib/utils';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import { groupSlotsByDay, resolveTimeZone } from '@/modules/commercial';

export type BookingActionState =
  | { status: 'idle' }
  | { status: 'booked'; startsAt: string; meetUrl: string | null }
  | { status: 'slot_taken'; slots: string[] }
  | { status: 'unavailable' }
  | { status: 'closed' }
  | { status: 'throttled' }
  | { status: 'too_late' }
  | { status: 'error' };

type BookingPanelProps = {
  slots: string[];
  bookingTimeZone: string;
  defaultTimeZone?: string;
  durationMinutes: number;
  action: (state: BookingActionState, formData: FormData) => Promise<BookingActionState>;
};

const ERROR_KEYS = {
  unavailable: 'unavailable',
  closed: 'closed',
  throttled: 'throttled',
  too_late: 'tooLate',
  error: 'error',
} as const;

function timeZones(current: string): string[] {
  const all =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return all.includes(current) ? all : [current, ...all];
}

export function BookingPanel(props: BookingPanelProps) {
  const t = useTranslations('publicApply.booking');
  const locale = useLocale();
  const [state, formAction] = useActionState(props.action, { status: 'idle' });
  const [timeZone, setTimeZone] = useState(() =>
    resolveTimeZone(props.defaultTimeZone, props.bookingTimeZone),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const bookedRef = useRef<HTMLHeadingElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (props.defaultTimeZone) return;
    setTimeZone(
      resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone, props.bookingTimeZone),
    );
  }, [props.defaultTimeZone, props.bookingTimeZone]);

  useEffect(() => {
    if (state.status === 'slot_taken') setSelected(null);
    if (state.status === 'booked') bookedRef.current?.focus();
    else if (state.status !== 'idle') messageRef.current?.focus();
  }, [state]);

  const slots = state.status === 'slot_taken' ? state.slots : props.slots;
  const groups = useMemo(
    () =>
      groupSlotsByDay(
        slots.map((slot) => new Date(slot)),
        timeZone,
      ),
    [slots, timeZone],
  );
  const activeDay = groups.find((group) => group.day === day) ?? groups[0];

  const dayLabel = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
  const fullLabel = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  if (state.status === 'booked') {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
        <h2 ref={bookedRef} tabIndex={-1} className="text-title text-text outline-none">
          {t('booked.title')}
        </h2>
        <p className="text-body text-text-secondary">
          {t('booked.body', { when: fullLabel.format(new Date(state.startsAt)) })}
        </p>
        {state.meetUrl ? (
          <a
            href={state.meetUrl}
            className="text-body text-link underline-offset-4 hover:underline"
            rel="noreferrer"
            target="_blank"
          >
            {t('meet')}
          </a>
        ) : null}
      </section>
    );
  }

  const errorKey =
    state.status in ERROR_KEYS ? ERROR_KEYS[state.status as keyof typeof ERROR_KEYS] : null;

  return (
    <section className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-title text-text">{t('title')}</h2>
        <p className="text-body-sm text-text-secondary">
          {t('duration', { minutes: props.durationMinutes })}
        </p>
      </header>

      <label className="flex flex-col gap-2 text-label text-text">
        {t('timeZone')}
        <select
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          className="h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9"
        >
          {timeZones(timeZone).map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>

      {state.status === 'slot_taken' ? (
        <FormMessage tone="warning" ref={messageRef} tabIndex={-1}>
          {t('slotTaken')}
        </FormMessage>
      ) : null}
      {errorKey ? (
        <FormMessage tone="danger" ref={messageRef} tabIndex={-1}>
          {t(errorKey)}
        </FormMessage>
      ) : null}

      {groups.length === 0 ? (
        <p className="text-body text-text-secondary">{t('noSlots')}</p>
      ) : (
        <>
          <div role="group" aria-label={t('days')} className="flex gap-2 overflow-x-auto pb-1">
            {groups.map((group) => {
              const active = group.day === activeDay?.day;
              return (
                <button
                  key={group.day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDay(group.day);
                    setSelected(null);
                  }}
                  className={cn(
                    'min-h-11 shrink-0 rounded-md border px-3 text-body-sm capitalize',
                    active
                      ? 'border-border-strong bg-surface-muted text-text'
                      : 'border-border text-text-secondary hover:bg-surface-muted',
                  )}
                >
                  {group.slots[0] ? dayLabel.format(group.slots[0]) : group.day}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label={t('times')}
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {(activeDay?.slots ?? []).map((slot) => {
              const iso = slot.toISOString();
              const active = selected === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(iso)}
                  className={cn(
                    'min-h-11 rounded-md border text-body tabular-nums',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-text hover:bg-surface-muted',
                  )}
                >
                  {timeLabel.format(slot)}
                </button>
              );
            })}
          </div>
        </>
      )}

      {selected ? (
        <form action={formAction} className="flex flex-col gap-3 border-t border-border pt-4">
          <input type="hidden" name="start" value={selected} />
          <input type="hidden" name="timeZone" value={timeZone} />
          <p className="text-body text-text">
            <span className="block font-medium">{t('confirmTitle')}</span>
            {fullLabel.format(new Date(selected))}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-11 md:h-9"
              onClick={() => setSelected(null)}
            >
              {t('change')}
            </Button>
            <div className="sm:w-56">
              <SubmitButton>{t('confirm')}</SubmitButton>
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );
}
