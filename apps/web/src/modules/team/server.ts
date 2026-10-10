import 'server-only';
import type { ClientRole, OrgRole } from '@agency-os/db';
import type { Currency, Locale } from '@agency-os/i18n';
import { createInvitationDeps } from '@/modules/identity';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import {
  changeRole,
  listTeam,
  loadMember,
  restoreAccess,
  revokeAccess,
  setClientAssignment,
  setProjectAssignment,
  setRates,
} from './service';
import {
  changeColleagueRole,
  inviteColleague,
  listColleagues,
  revokeColleague,
} from './colleagues';

const deps = () => ({ contexts: { withUserContext, withSystemContext } });

export function loadTeam(claims: VerifiedClaims, now: Date) {
  return listTeam(claims, now, deps());
}

export function loadTeamMember(claims: VerifiedClaims, userId: string) {
  return loadMember(claims, userId, deps());
}

export function changeMemberRole(claims: VerifiedClaims, userId: string, role: OrgRole) {
  return changeRole(claims, { userId, role }, deps());
}

export function revokeMemberAccess(claims: VerifiedClaims, userId: string) {
  return revokeAccess(claims, { userId }, deps());
}

export function restoreMemberAccess(claims: VerifiedClaims, userId: string) {
  return restoreAccess(claims, { userId }, deps());
}

export function setMemberClient(
  claims: VerifiedClaims,
  input: { userId: string; clientId: string; assigned: boolean },
) {
  return setClientAssignment(claims, input, deps());
}

export function setMemberProject(
  claims: VerifiedClaims,
  input: { userId: string; projectId: string; assigned: boolean },
) {
  return setProjectAssignment(claims, input, deps());
}

export function saveMemberRates(
  claims: VerifiedClaims,
  input: {
    userId: string;
    hourlyCost: string | null;
    currency: Currency;
    weeklyHours: number | null;
  },
) {
  return setRates(claims, input, deps());
}

export async function loadColleagues(claims: VerifiedClaims, clientId: string) {
  return listColleagues(claims, clientId, deps());
}

export async function inviteClientColleague(
  claims: VerifiedClaims,
  input: { clientId: string; email: string; fullName: string; role: ClientRole },
  locale: Locale,
) {
  return inviteColleague(claims, input, await createInvitationDeps(locale));
}

export function changeClientColleagueRole(
  claims: VerifiedClaims,
  membershipId: string,
  role: ClientRole,
) {
  return changeColleagueRole(claims, { membershipId, role }, deps());
}

export function revokeClientColleague(claims: VerifiedClaims, membershipId: string) {
  return revokeColleague(claims, { membershipId }, deps());
}
