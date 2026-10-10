'use server';

import { revalidatePath } from 'next/cache';
import type { StepStatus } from '@/modules/rooms';
import {
  completeRoomPhase,
  createRoomProject,
  publishRoomUpdate,
  requestRoomApproval,
  requestRoomFinalApproval,
  setRoomStepStatus,
  startRoomPhase,
  updateRoomPhase,
  updateRoomStep,
  withdrawRoomApproval,
} from '@/modules/rooms/server';
import { getVerifiedClaims } from '@/platform/session';
import type { ActionResult } from './room/room-errors';

async function session() {
  const claims = await getVerifiedClaims();
  return claims ? { claims } : null;
}

function outcome(result: { ok: true } | { ok: false; rule: string }): ActionResult {
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

async function run(
  action: (
    current: NonNullable<Awaited<ReturnType<typeof session>>>,
  ) => Promise<{ ok: true } | { ok: false; rule: string }>,
): Promise<ActionResult> {
  const current = await session();
  if (!current) return { ok: false, code: 'not_found' };
  const result = outcome(await action(current));
  if (result.ok) revalidatePath('/c', 'layout');
  return result;
}

export async function startPhaseAction(phaseId: string) {
  return run((current) => startRoomPhase(current, phaseId));
}

export async function completePhaseAction(phaseId: string) {
  return run((current) => completeRoomPhase(current, phaseId));
}

export async function requestFinalApprovalAction(projectId: string) {
  return run(async (current) => {
    const result = await requestRoomFinalApproval(current, projectId);
    return result.ok ? { ok: true as const } : result;
  });
}

export async function requestApprovalAction(phaseId: string) {
  return run(async (current) => {
    const result = await requestRoomApproval(current, phaseId);
    return result.ok ? { ok: true as const } : result;
  });
}

export async function withdrawApprovalAction(approvalId: string) {
  return run((current) => withdrawRoomApproval(current, approvalId));
}

export async function updatePhaseAction(phaseId: string, dueOn: string | null) {
  return run((current) => updateRoomPhase(current, phaseId, dueOn));
}

export async function setStepStatusAction(stepId: string, status: StepStatus) {
  return run((current) => setRoomStepStatus(current, stepId, status));
}

export async function updateStepAction(input: {
  stepId: string;
  assigneeId?: string | null;
  dueOn?: string | null;
  visibleToClient?: boolean;
}) {
  return run((current) => updateRoomStep(current, input));
}

export async function publishUpdateAction(input: {
  projectId: string;
  body: string;
  milestone: string | null;
  visibility: 'internal' | 'client';
  fileIds: string[];
}) {
  return run((current) => publishRoomUpdate(current, input));
}

export async function createProjectAction(input: {
  clientId: string;
  name: string;
  templateKey: string;
}) {
  return run(async (current) => {
    const result = await createRoomProject(current, input);
    return result.ok ? { ok: true as const } : result;
  });
}
