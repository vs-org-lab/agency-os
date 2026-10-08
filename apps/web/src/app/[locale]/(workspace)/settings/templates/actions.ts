'use server';

import { revalidatePath } from 'next/cache';
import { isFounderActor } from '@/modules/commercial';
import { commercialSession } from '@/modules/commercial/server';
import { publishCoreTemplate } from '@/modules/diagnosis/server';
import { getVerifiedClaims } from '@/platform/session';
import type { PublishResult } from './orbit-grid-editor';

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
