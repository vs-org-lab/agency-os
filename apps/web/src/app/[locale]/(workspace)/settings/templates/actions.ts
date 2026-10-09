'use server';

import { revalidatePath } from 'next/cache';
import { isFounderActor } from '@/modules/commercial';
import { commercialSession } from '@/modules/commercial/server';
import type { Locale } from '@agency-os/i18n';
import { publishTemplate, type PublishContractTemplateResult } from '@/modules/contracts/server';
import { publishCoreTemplate } from '@/modules/diagnosis/server';
import { publishProcess } from '@/modules/rooms/server';
import { getVerifiedClaims } from '@/platform/session';
import type { PublishResult } from './orbit-grid-editor';
import type { PublishProcessInput } from './process-template-editor';

export async function publishCoreTemplateAction(
  kind: 'briefing' | 'orbit_grid',
  definition: unknown,
): Promise<PublishResult> {
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !isFounderActor(session.actor)) return { ok: false, rule: 'not_found' };
  const result = await publishCoreTemplate(session, { kind, definition });
  if (result.ok) revalidatePath('/settings/templates');
  return result;
}

export async function publishContractTemplateAction(
  locale: Locale,
  body: string,
): Promise<PublishContractTemplateResult> {
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !isFounderActor(session.actor)) return { ok: false, rule: 'not_found' };
  const result = await publishTemplate(session, { locale, body });
  if (result.ok) revalidatePath('/settings/templates');
  return result;
}

export async function publishProcessTemplateAction(input: PublishProcessInput) {
  const session = await commercialSession(await getVerifiedClaims());
  if (!session || !isFounderActor(session.actor)) return { ok: false as const, rule: 'not_found' };
  const result = await publishProcess(session, input);
  if (result.ok) revalidatePath('/settings/templates');
  return result;
}
