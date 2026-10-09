import 'server-only';
import type { StepStatus, UpdateVisibility } from '@agency-os/db';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import {
  decideApproval,
  requestPhaseApproval,
  withdrawApproval,
  type ApprovalDecision,
} from './approvals';
import { roomActor } from './authorize';
import { getClientRoom } from './portal';
import { completePhase, setStepStatus, startPhase, updatePhase, updateStep } from './process';
import { loadRoom, loadRoomPreview } from './room';
import { publishUpdate } from './updates';
import { createProjectAsStaff } from './projects';
import { roomsDeps } from './runtime';
import {
  ensureProcessTemplates,
  listProcessTemplates,
  publishProcessTemplate,
  type ProcessTemplate,
} from './templates/service';

export type RoomSession = { claims: VerifiedClaims };

export async function loadProcessTemplates(
  session: RoomSession & { organizationId: string },
): Promise<ProcessTemplate[]> {
  await withSystemContext((tx) => ensureProcessTemplates(tx, session.organizationId));
  return withUserContext(session.claims, (tx) => listProcessTemplates(tx, session.organizationId));
}

export function publishProcess(
  session: RoomSession,
  input: { key?: string; name: string; definition: unknown; makeDefault: boolean },
) {
  return publishProcessTemplate(session.claims, input, roomsDeps());
}

export function createRoomProject(
  session: RoomSession,
  input: { clientId: string; dealId?: string; name: string; templateKey?: string },
) {
  return createProjectAsStaff(session.claims, input, roomsDeps());
}

export type { ProcessTemplate } from './templates/service';

export async function loadStaffRoom(
  session: RoomSession,
  input: { clientId: string; projectId?: string },
) {
  const deps = roomsDeps();
  const [room, writer] = await Promise.all([
    loadRoom(session.claims, input, deps),
    roomActor(deps.contexts, session.claims, input.clientId, 'write'),
  ]);
  return room ? { room, writable: writer !== null } : null;
}

export function loadStaffPreview(
  session: RoomSession,
  input: { clientId: string; projectId?: string },
) {
  return loadRoomPreview(session.claims, input, roomsDeps());
}

export function loadPortalRoom(claims: VerifiedClaims, clientId: string, projectId?: string) {
  return withUserContext(claims, (tx) => getClientRoom(tx, clientId, projectId));
}

export function startRoomPhase(session: RoomSession, phaseId: string) {
  return startPhase(session.claims, { phaseId }, roomsDeps());
}

export function completeRoomPhase(session: RoomSession, phaseId: string) {
  return completePhase(session.claims, { phaseId }, roomsDeps());
}

export function updateRoomPhase(session: RoomSession, phaseId: string, dueOn: string | null) {
  return updatePhase(session.claims, { phaseId, dueOn }, roomsDeps());
}

export function setRoomStepStatus(session: RoomSession, stepId: string, status: StepStatus) {
  return setStepStatus(session.claims, { stepId, status }, roomsDeps());
}

export function updateRoomStep(
  session: RoomSession,
  input: {
    stepId: string;
    assigneeId?: string | null;
    dueOn?: string | null;
    visibleToClient?: boolean;
  },
) {
  return updateStep(session.claims, input, roomsDeps());
}

export function requestRoomApproval(session: RoomSession, phaseId: string) {
  return requestPhaseApproval(session.claims, { phaseId }, roomsDeps());
}

export function withdrawRoomApproval(session: RoomSession, approvalId: string) {
  return withdrawApproval(session.claims, { approvalId }, roomsDeps());
}

export function decideRoomApproval(
  claims: VerifiedClaims,
  input: { approvalId: string; decision: ApprovalDecision; comment: string },
) {
  return decideApproval(claims, input, roomsDeps());
}

export function publishRoomUpdate(
  session: RoomSession,
  input: {
    projectId: string;
    body: string;
    milestone: string | null;
    visibility: UpdateVisibility;
  },
) {
  return publishUpdate(session.claims, input, roomsDeps());
}
export { ROOM_FUNCTIONS } from './automations';
