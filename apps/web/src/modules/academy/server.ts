import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { AcademyDeps } from './access';
import { setStepCheck } from './checks';
import { deleteAcademyItem, moveAcademyItem, saveAcademyItem, setAcademyItemStatus } from './items';
import { loadPortalAcademy, loadRoomAcademy } from './readers';
import { deleteTrainingSession, saveTrainingSession } from './sessions';

const deps = (): AcademyDeps => ({ contexts: { withUserContext, withSystemContext } });

export const loadClientRoomAcademy = (claims: VerifiedClaims, clientId: string) =>
  loadRoomAcademy(claims, clientId, deps());
export const loadClientPortalAcademy = (claims: VerifiedClaims, clientId: string) =>
  loadPortalAcademy(claims, clientId, deps());
export const storeAcademyItem = (
  claims: VerifiedClaims,
  input: { clientId: string; itemId?: string } & Record<string, unknown>,
) => saveAcademyItem(claims, input, deps());
export const changeAcademyItemStatus = (
  claims: VerifiedClaims,
  input: { itemId: string; status: 'draft' | 'published' },
) => setAcademyItemStatus(claims, input, deps());
export const removeAcademyItem = (claims: VerifiedClaims, itemId: string) =>
  deleteAcademyItem(claims, itemId, deps());
export const reorderAcademyItem = (
  claims: VerifiedClaims,
  input: { itemId: string; direction: 'up' | 'down' },
) => moveAcademyItem(claims, input, deps());
export const markAcademyStep = (claims: VerifiedClaims, input: { stepId: string; done: boolean }) =>
  setStepCheck(claims, input, deps());
export const storeTrainingSession = (
  claims: VerifiedClaims,
  input: { clientId: string; sessionId?: string } & Record<string, unknown>,
) => saveTrainingSession(claims, input, deps());
export const removeTrainingSession = (claims: VerifiedClaims, sessionId: string) =>
  deleteTrainingSession(claims, sessionId, deps());
