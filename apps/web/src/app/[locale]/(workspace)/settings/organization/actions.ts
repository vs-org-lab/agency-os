'use server';

import { revalidatePath } from 'next/cache';
import { isFounderActor } from '@/modules/commercial';
import { commercialSession } from '@/modules/commercial/server';
import { archiveEntity, saveEntity, type LegalEntityInput } from '@/modules/contracts/server';
import { getVerifiedClaims } from '@/platform/session';

export type EntityActionResult = { ok: true } | { ok: false };

async function founderSession() {
  const session = await commercialSession(await getVerifiedClaims());
  return session && isFounderActor(session.actor) ? session : null;
}

export async function saveEntityAction(input: LegalEntityInput): Promise<EntityActionResult> {
  const session = await founderSession();
  if (!session) return { ok: false };
  const result = await saveEntity(session, input);
  if (result.ok) revalidatePath('/settings/organization');
  return { ok: result.ok };
}

export async function archiveEntityAction(entityId: string): Promise<void> {
  const session = await founderSession();
  if (!session) return;
  const result = await archiveEntity(session, { entityId });
  if (result.ok) revalidatePath('/settings/organization');
}
