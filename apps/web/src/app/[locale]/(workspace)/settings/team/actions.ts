'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import type { OrgRole } from '@agency-os/db';
import type { InviteInput } from '@/components/team/invite-form';
import type { RatesInput } from '@/components/team/member-form';
import type { TeamActionResult } from '@/components/team/team-errors';
import { requireArea } from '@/components/shell/session-guard';
import { redirect } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { createInvitationDeps, inviteTeamMember, resendInvitation } from '@/modules/identity';
import {
  changeMemberRole,
  restoreMemberAccess,
  revokeMemberAccess,
  saveMemberRates,
  setMemberClient,
  setMemberProject,
} from '@/modules/team/server';

type TeamRole = 'project_manager' | 'freelancer' | 'finance';

const LOCALE_PREFIX = /^\/(pt-PT|en)(?=\/|$)/;

async function currentSession() {
  return requireArea('/', requireLocale(await getLocale()));
}

/** Sends the caller to confirm a TOTP code and back to the page the action came from (SEC-03). */
async function reauthenticate(): Promise<never> {
  const referer = (await headers()).get('referer');
  const path = referer ? new URL(referer).pathname.replace(LOCALE_PREFIX, '') || '/' : '/';
  return redirect({
    href: `/mfa/verify?reason=reauthenticate&next=${encodeURIComponent(path)}`,
    locale: await getLocale(),
  });
}

async function outcome(
  result: { ok: true } | { ok: false; rule: string },
): Promise<TeamActionResult> {
  if (!result.ok && result.rule === 'reauthentication_required') return reauthenticate();
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath('/settings/team', 'layout');
  return { ok: true };
}

export async function inviteTeamAction(input: InviteInput<TeamRole>): Promise<TeamActionResult> {
  const session = await currentSession();
  const result = await inviteTeamMember(
    session,
    input,
    await createInvitationDeps(requireLocale(await getLocale())),
  );
  return outcome('membershipId' in result ? { ok: true } : { ok: false, rule: result.error });
}

export async function resendTeamInvitationAction(membershipId: string) {
  const session = await currentSession();
  return outcome(
    await resendInvitation(
      session,
      { membershipId, kind: 'internal' },
      await createInvitationDeps(requireLocale(await getLocale())),
    ),
  );
}

export async function changeRoleAction(userId: string, role: OrgRole) {
  const session = await currentSession();
  return outcome(await changeMemberRole(session.claims, userId, role));
}

export async function revokeAccessAction(userId: string) {
  const session = await currentSession();
  return outcome(await revokeMemberAccess(session.claims, userId));
}

export async function restoreAccessAction(userId: string) {
  const session = await currentSession();
  return outcome(await restoreMemberAccess(session.claims, userId));
}

export async function saveRatesAction(userId: string, rates: RatesInput) {
  const session = await currentSession();
  return outcome(await saveMemberRates(session.claims, { userId, ...rates }));
}

export async function setClientAction(userId: string, clientId: string, assigned: boolean) {
  const session = await currentSession();
  return outcome(await setMemberClient(session.claims, { userId, clientId, assigned }));
}

export async function setProjectAction(userId: string, projectId: string, assigned: boolean) {
  const session = await currentSession();
  return outcome(await setMemberProject(session.claims, { userId, projectId, assigned }));
}
