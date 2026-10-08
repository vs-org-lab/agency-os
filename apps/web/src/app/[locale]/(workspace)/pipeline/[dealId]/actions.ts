'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  closeFollowUp,
  commercialSession,
  recordOutcome,
  saveContact,
  scheduleCall,
  updateTracking,
} from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';

export type FormState = { status: 'idle' | 'saved' } | { status: 'error'; code: string };

const IDLE_ERROR: FormState = { status: 'error', code: 'not_found' };

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

async function session() {
  return commercialSession(await getVerifiedClaims());
}

function refresh(dealId: string) {
  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath('/pipeline');
}

export async function updateTrackingAction(
  dealId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await session();
  if (!current) return IDLE_ERROR;
  const owner = text(formData, 'owner');
  const result = await updateTracking(current, {
    dealId,
    nextStep: text(formData, 'nextStep'),
    nextStepOwnerKind: owner === null ? null : owner === 'client' ? 'client' : 'staff',
    nextStepOwnerUserId: owner && owner !== 'client' ? owner : null,
    nextStepDueOn: text(formData, 'dueOn'),
    estimatedValue: text(formData, 'value')?.replace(',', '.') ?? null,
    currency: (text(formData, 'currency') ?? 'EUR') as 'EUR' | 'GBP' | 'USD',
  });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

export async function recordOutcomeAction(
  dealId: string,
  callId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await session();
  if (!current) return IDLE_ERROR;
  const status = text(formData, 'status') === 'no_show' ? 'no_show' : 'completed';
  const outcome = text(formData, 'outcome');
  const result = await recordOutcome(current, {
    callId,
    status,
    outcome:
      outcome === 'advance' || outcome === 'decline' || outcome === 'follow_up' ? outcome : null,
    reason: text(formData, 'reason'),
    notes: text(formData, 'notes'),
  });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

export async function scheduleCallAction(
  dealId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await session();
  if (!current) return IDLE_ERROR;
  const start = new Date(text(formData, 'start') ?? '');
  const duration = Number(text(formData, 'duration') ?? '45');
  if (Number.isNaN(start.getTime())) return { status: 'error', code: 'invalid_input' };
  const kind = text(formData, 'kind') === 'proposal_session' ? 'proposal_session' : 'discovery';
  const result = await scheduleCall(current, { dealId, start, durationMinutes: duration, kind });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

const roleSchema = z.enum(['decision_maker', 'operational', 'client_finance']);

export async function saveContactAction(
  dealId: string,
  clientId: string,
  contactId: string | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await session();
  if (!current) return IDLE_ERROR;
  const role = roleSchema.safeParse(text(formData, 'role'));
  const result = await saveContact(current, {
    clientId,
    contactId,
    fullName: text(formData, 'fullName') ?? '',
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    jobTitle: text(formData, 'jobTitle'),
    role: role.success ? role.data : 'operational',
  });
  if (!result.ok) return { status: 'error', code: result.rule };
  refresh(dealId);
  return { status: 'saved' };
}

export async function closeFollowUpAction(
  dealId: string,
  followUpId: string,
  status: 'done' | 'dismissed',
): Promise<void> {
  const current = await session();
  if (!current) return;
  await closeFollowUp(current, { followUpId, status });
  refresh(dealId);
}
