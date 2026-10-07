'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { redirect } from '@/i18n/navigation';
import { commercialSession, convertTarget, saveTarget } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';

export type AcquisitionFormState = { status: 'idle' | 'saved' } | { status: 'error' };

const statusSchema = z.enum(['to_contact', 'contacted', 'replied', 'converted', 'discarded']);
const roleSchema = z.enum(['decision_maker', 'operational', 'client_finance']);

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export async function saveTargetAction(
  targetId: string | null,
  _state: AcquisitionFormState,
  formData: FormData,
): Promise<AcquisitionFormState> {
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) return { status: 'error' };
  const status = statusSchema.safeParse(text(formData, 'status') ?? 'to_contact');
  const result = await saveTarget(session, {
    targetId,
    companyName: text(formData, 'companyName') ?? '',
    sector: text(formData, 'sector') ?? '',
    website: text(formData, 'website'),
    notes: text(formData, 'notes'),
    status: status.success ? status.data : 'to_contact',
  });
  if (!result.ok) return { status: 'error' };
  revalidatePath('/acquisition');
  return { status: 'saved' };
}

export async function convertTargetAction(
  targetId: string,
  _state: AcquisitionFormState,
  formData: FormData,
): Promise<AcquisitionFormState> {
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) return { status: 'error' };
  const role = roleSchema.safeParse(text(formData, 'role'));
  const result = await convertTarget(session, {
    targetId,
    contact: {
      fullName: text(formData, 'fullName') ?? '',
      email: text(formData, 'email'),
      role: role.success ? role.data : 'decision_maker',
    },
  });
  if (!result.ok) return { status: 'error' };
  revalidatePath('/acquisition');
  revalidatePath('/pipeline');
  return redirect({ href: `/pipeline/${result.dealId}`, locale: await getLocale() });
}
