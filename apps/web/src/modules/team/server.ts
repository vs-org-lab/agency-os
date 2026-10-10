import 'server-only';
import type { OrgRole } from '@agency-os/db';
import type { Currency } from '@agency-os/i18n';
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
