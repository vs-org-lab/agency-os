'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import type { ClientRole } from '@agency-os/db';
import type { InviteInput } from '@/components/team/invite-form';
import type { TeamActionResult } from '@/components/team/team-errors';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import {
  changeClientColleagueRole,
  inviteClientColleague,
  revokeClientColleague,
} from '@/modules/team/server';
import { portalRoomAccess } from '../../room-session';

async function portalSession() {
  const locale = requireLocale(await getLocale());
  const session = await requireArea('/portal', locale);
  return { session, locale, clientId: portalRoomAccess(session.ctx.clientRoles).clientId };
}

function outcome(result: { ok: true } | { ok: false; rule: string }): TeamActionResult {
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath('/portal/settings/team');
  return { ok: true };
}

export async function inviteColleagueAction(
  input: InviteInput<ClientRole>,
): Promise<TeamActionResult> {
  const { session, locale, clientId } = await portalSession();
  if (!clientId) return { ok: false, code: 'not_found' };
  return outcome(await inviteClientColleague(session.claims, { ...input, clientId }, locale));
}

export async function changeColleagueRoleAction(membershipId: string, role: ClientRole) {
  const { session } = await portalSession();
  return outcome(await changeClientColleagueRole(session.claims, membershipId, role));
}

export async function revokeColleagueAction(membershipId: string) {
  const { session } = await portalSession();
  return outcome(await revokeClientColleague(session.claims, membershipId));
}
