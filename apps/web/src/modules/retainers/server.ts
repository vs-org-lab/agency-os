import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { RetainersDeps } from './access';
import { loadStaffRetainer } from './readers';
import { saveRetainer, type RetainerInput } from './retainers';
import { deleteUsage, recordUsage } from './usage';

const deps = (): RetainersDeps => ({ contexts: { withUserContext, withSystemContext } });

export const loadRoomRetainer = (claims: VerifiedClaims, clientId: string) =>
  loadStaffRetainer(claims, clientId, deps());
export const storeRetainer = (claims: VerifiedClaims, input: RetainerInput) =>
  saveRetainer(claims, input, deps());
export const addUsage = (
  claims: VerifiedClaims,
  input: { retainerId: string; kind: string; quantity: string; description: string },
) => recordUsage(claims, input, deps());
export const removeUsage = (claims: VerifiedClaims, usageId: string) =>
  deleteUsage(claims, usageId, deps());
