'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { SubmitButton } from '@/components/forms/submit-button';
import type { SettingsFormState } from './commercial-actions';

type BoundAction = (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const KINDS = ['follow_up', 'acquisition', 'email'] as const;
const LOCALES = ['pt-PT', 'en'] as const;
const SEQUENCE_DAYS = ['3', '7', '14', '30'] as const;

export type BookingDefaults = {
  timeZone: string;
  weeklyHours: Record<(typeof DAYS)[number], Array<{ start: string; end: string }>>;
  durationMinutes: number;
  bufferMinutes: number;
  minimumNoticeHours: number;
  horizonDays: number;
  selfDiagnosisUrl: string | null;
  anonymizeAfterMonths: number;
};

export function BookingSettingsForm({
  action,
  defaults,
  timeZones,
}: {
  action: BoundAction;
  defaults: BookingDefaults;
  timeZones: string[];
}) {
  const t = useTranslations('settings.booking');
  const [state, formAction] = useActionState<SettingsFormState, FormData>(action, {
    status: 'idle',
  });

  const numberField = (name: keyof BookingDefaults, label: string, min: number, max: number) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`booking-${name}`}>{label}</Label>
      <Input
        id={`booking-${name}`}
        name={name}
        type="number"
        min={min}
        max={max}
        defaultValue={String(defaults[name])}
      />
    </div>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 md:max-w-sm">
        <Label htmlFor="booking-time-zone">{t('timeZone')}</Label>
        <select
          id="booking-time-zone"
          name="timeZone"
          defaultValue={defaults.timeZone}
          className={FIELD}
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        {DAYS.map((day) => {
          const window = defaults.weeklyHours[day][0];
          return (
            <div key={day} className="grid grid-cols-[96px_1fr_1fr] items-end gap-3">
              <span className="pb-2 text-body-sm text-text">{t(`days.${day}`)}</span>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${day}-start`}>{t('start')}</Label>
                <Input
                  id={`${day}-start`}
                  name={`${day}-start`}
                  type="time"
                  defaultValue={window?.start ?? ''}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${day}-end`}>{t('end')}</Label>
                <Input
                  id={`${day}-end`}
                  name={`${day}-end`}
                  type="time"
                  defaultValue={window?.end ?? ''}
                />
              </div>
            </div>
          );
        })}
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        {numberField('durationMinutes', t('duration'), 15, 120)}
        {numberField('bufferMinutes', t('buffer'), 0, 60)}
        {numberField('minimumNoticeHours', t('notice'), 0, 168)}
        {numberField('horizonDays', t('horizon'), 1, 60)}
        {numberField('anonymizeAfterMonths', t('anonymize'), 1, 60)}
        <div className="flex flex-col gap-1">
          <Label htmlFor="booking-self-diagnosis">{t('selfDiagnosis')}</Label>
          <Input
            id="booking-self-diagnosis"
            name="selfDiagnosisUrl"
            type="url"
            defaultValue={defaults.selfDiagnosisUrl ?? ''}
          />
        </div>
      </div>

      {state.status === 'saved' ? <FormMessage tone="success">{t('saved')}</FormMessage> : null}
      {state.status === 'error' ? <FormMessage tone="danger">{t('invalid')}</FormMessage> : null}
      <div className="md:w-40">
        <SubmitButton>{t('save')}</SubmitButton>
      </div>
    </form>
  );
}

export type TemplateDefaults = {
  kind: string;
  locale: string;
  name: string;
  sector: string | null;
  sequenceDay: number | null;
  subject: string | null;
  body: string;
};

export function TemplateForm({
  action,
  defaults,
  idPrefix,
}: {
  action: BoundAction;
  defaults: TemplateDefaults | null;
  idPrefix: string;
}) {
  const t = useTranslations('settings.templates');
  const [state, formAction] = useActionState<SettingsFormState, FormData>(action, {
    status: 'idle',
  });

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-kind`}>{t('kind')}</Label>
        <select
          id={`${idPrefix}-kind`}
          name="kind"
          defaultValue={defaults?.kind ?? 'acquisition'}
          className={FIELD}
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-locale`}>{t('locale')}</Label>
        <select
          id={`${idPrefix}-locale`}
          name="locale"
          defaultValue={defaults?.locale ?? 'pt-PT'}
          className={FIELD}
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {locale}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-name`}>{t('name')}</Label>
        <Input id={`${idPrefix}-name`} name="name" required defaultValue={defaults?.name ?? ''} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-sector`}>{t('sector')}</Label>
        <Input id={`${idPrefix}-sector`} name="sector" defaultValue={defaults?.sector ?? ''} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-day`}>{t('day')}</Label>
        <select
          id={`${idPrefix}-day`}
          name="sequenceDay"
          defaultValue={defaults?.sequenceDay ? String(defaults.sequenceDay) : ''}
          className={FIELD}
        >
          <option value="" />
          {SEQUENCE_DAYS.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-subject`}>{t('subject')}</Label>
        <Input id={`${idPrefix}-subject`} name="subject" defaultValue={defaults?.subject ?? ''} />
      </div>
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor={`${idPrefix}-body`}>{t('body')}</Label>
        <Textarea
          id={`${idPrefix}-body`}
          name="body"
          rows={5}
          required
          defaultValue={defaults?.body ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        {state.status === 'saved' ? <FormMessage tone="success">{t('saved')}</FormMessage> : null}
        {state.status === 'error' ? <FormMessage tone="danger">{t('invalid')}</FormMessage> : null}
        <div className="md:w-48">
          <SubmitButton>{t('save')}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
