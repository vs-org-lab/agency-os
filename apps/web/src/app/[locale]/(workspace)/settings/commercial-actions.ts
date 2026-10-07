'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isFounderActor, type ApplicationFormDefinition } from '@/modules/commercial';
import {
  commercialSession,
  publishForm,
  saveBookingSettings,
  saveTemplate,
} from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';

export type SettingsFormState = { status: 'idle' | 'saved' } | { status: 'error' };

async function founderSession() {
  const session = await commercialSession(await getVerifiedClaims());
  return session && isFounderActor(session.actor) ? session : null;
}

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export async function publishFormAction(definition: ApplicationFormDefinition) {
  const session = await founderSession();
  if (!session) return { ok: false as const, issues: ['forbidden'] };
  const result = await publishForm(session, definition);
  if (result.ok) revalidatePath('/settings/application');
  return result;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export async function saveBookingAction(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await founderSession();
  if (!session) return { status: 'error' };
  const weeklyHours = Object.fromEntries(
    DAYS.map((day) => {
      const start = text(formData, `${day}-start`);
      const end = text(formData, `${day}-end`);
      return [day, start && end ? [{ start, end }] : []];
    }),
  ) as Record<(typeof DAYS)[number], Array<{ start: string; end: string }>>;
  const number = (name: string) => Number(text(formData, name) ?? Number.NaN);

  const result = await saveBookingSettings(session, {
    timeZone: text(formData, 'timeZone') ?? '',
    weeklyHours,
    durationMinutes: number('durationMinutes'),
    bufferMinutes: number('bufferMinutes'),
    minimumNoticeHours: number('minimumNoticeHours'),
    horizonDays: number('horizonDays'),
    selfDiagnosisUrl: text(formData, 'selfDiagnosisUrl'),
    anonymizeAfterMonths: number('anonymizeAfterMonths'),
  });
  if (!result.ok) return { status: 'error' };
  revalidatePath('/settings/booking');
  return { status: 'saved' };
}

const templateKind = z.enum(['follow_up', 'acquisition', 'email']);
const templateLocale = z.enum(['pt-PT', 'en']);

export async function saveTemplateAction(
  templateId: string | null,
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await founderSession();
  if (!session) return { status: 'error' };
  const kind = templateKind.safeParse(text(formData, 'kind'));
  const locale = templateLocale.safeParse(text(formData, 'locale'));
  const day = text(formData, 'sequenceDay');
  if (!kind.success || !locale.success) return { status: 'error' };

  const result = await saveTemplate(session, {
    templateId,
    kind: kind.data,
    locale: locale.data,
    sector: text(formData, 'sector'),
    sequenceDay: day ? Number(day) : null,
    name: text(formData, 'name') ?? '',
    subject: text(formData, 'subject'),
    body: text(formData, 'body') ?? '',
  });
  if (!result.ok) return { status: 'error' };
  revalidatePath('/settings/templates');
  return { status: 'saved' };
}
