'use server';

import type { ActionResult } from '@/components/agenda/meeting-dialog';
import {
  cancelAgendaMeeting,
  scheduleAgendaMeeting,
  updateAgendaMeeting,
} from '@/modules/agenda/server';
import { getVerifiedClaims } from '@/platform/session';

const NOT_FOUND = { ok: false, code: 'not_found' } as const;

function outcome(result: { ok: true } | { ok: false; rule: string }): ActionResult {
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function scheduleMeetingAction(input: Record<string, unknown>): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await scheduleAgendaMeeting(claims, input)) : NOT_FOUND;
}

export async function updateMeetingAction(
  input: { eventId: string } & Record<string, unknown>,
): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await updateAgendaMeeting(claims, input)) : NOT_FOUND;
}

export async function cancelMeetingAction(eventId: string): Promise<ActionResult> {
  const claims = await getVerifiedClaims();
  return claims ? outcome(await cancelAgendaMeeting(claims, eventId)) : NOT_FOUND;
}
