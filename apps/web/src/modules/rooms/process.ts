import { and, asc, desc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction, type StepStatus } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { roomActor } from './authorize';
import { canCompletePhase, canStartPhase, type ApprovalState } from './domain/phases';
import { nextChainedStep } from './domain/steps';
import type { RoomsDeps } from './runtime-types';

const {
  approvals,
  clientStaffAssignments,
  organizationMemberships,
  projectPhases,
  projectSteps,
  projectStaffAssignments,
  projectUpdates,
  projects,
} = schema;

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

type PhaseRow = typeof projectPhases.$inferSelect;
type StepRow = typeof projectSteps.$inferSelect;

export type ProcessRefusal =
  | 'not_found'
  | 'invalid_state'
  | 'invalid_input'
  | 'previous_phase_open'
  | 'steps_open'
  | 'approval_required';

/** The client a phase or step belongs to, as the caller may read it (row level security). */
async function visibleClient(
  contexts: Pick<DbContexts, 'withUserContext'>,
  claims: VerifiedClaims,
  target: { phaseId: string } | { stepId: string },
): Promise<string | null> {
  const id = 'phaseId' in target ? target.phaseId : target.stepId;
  if (!z.uuid().safeParse(id).success) return null;
  return contexts.withUserContext(claims, async (tx) => {
    const [row] =
      'phaseId' in target
        ? await tx
            .select({ clientId: projectPhases.clientId })
            .from(projectPhases)
            .where(eq(projectPhases.id, id))
        : await tx
            .select({ clientId: projectSteps.clientId })
            .from(projectSteps)
            .where(eq(projectSteps.id, id));
    return row?.clientId ?? null;
  });
}

async function phaseWriter(deps: RoomsDeps, claims: VerifiedClaims, phaseId: string) {
  const clientId = await visibleClient(deps.contexts, claims, { phaseId });
  if (!clientId) return null;
  return roomActor(deps.contexts, claims, clientId, 'write');
}

async function lockProject(tx: DbTransaction, projectId: string) {
  const [project] = await tx
    .select({ id: projects.id, dealId: projects.dealId, status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for('update');
  return project ?? null;
}

async function phaseApprovalState(tx: DbTransaction, phaseId: string): Promise<ApprovalState> {
  const [latest] = await tx
    .select({ status: approvals.status })
    .from(approvals)
    .where(and(eq(approvals.subjectType, 'phase'), eq(approvals.subjectId, phaseId)))
    .orderBy(desc(approvals.requestedAt))
    .limit(1);
  if (latest?.status === 'approved' || latest?.status === 'pending') return latest.status;
  return null;
}

async function shareStep(tx: DbTransaction, step: StepRow, now: Date): Promise<void> {
  await tx.update(projectSteps).set({ sharedAt: now }).where(eq(projectSteps.id, step.id));
  await tx.insert(projectUpdates).values({
    organizationId: step.organizationId,
    clientId: step.clientId,
    projectId: step.projectId,
    kind: 'step_shared',
    body: step.name,
    visibility: 'client',
  });
  await emit(tx, {
    type: 'rooms.step.shared',
    organizationId: step.organizationId,
    clientId: step.clientId,
    payload: { projectId: step.projectId, stepId: step.id },
  });
}

/**
 * Completes a phase once its steps are done and, when required, it is approved: posts the
 * client-visible feed entry, moves the deal to the phase's done code and closes the project
 * after its last phase.
 */
export async function completePhaseInTx(
  tx: DbTransaction,
  phase: PhaseRow,
  deps: Pick<RoomsDeps, 'moveDeal'>,
  now: Date,
): Promise<{ ok: true } | { ok: false; rule: ProcessRefusal }> {
  const project = await lockProject(tx, phase.projectId);
  if (!project) return NOT_FOUND;
  const steps = await tx
    .select({ status: projectSteps.status })
    .from(projectSteps)
    .where(eq(projectSteps.phaseId, phase.id));
  const decision = canCompletePhase(phase, steps, await phaseApprovalState(tx, phase.id));
  if (!decision.ok) return decision;

  const completed = await tx
    .update(projectPhases)
    .set({ status: 'done', completedAt: now })
    .where(
      and(
        eq(projectPhases.id, phase.id),
        inArray(projectPhases.status, ['in_progress', 'awaiting_approval']),
      ),
    )
    .returning({ id: projectPhases.id });
  if (completed.length === 0) return { ok: false, rule: 'invalid_state' };
  await tx.insert(projectUpdates).values({
    organizationId: phase.organizationId,
    clientId: phase.clientId,
    projectId: phase.projectId,
    kind: 'phase_done',
    body: phase.name,
    visibility: 'client',
  });
  if (phase.codeOnDone && project.dealId) await deps.moveDeal(tx, project.dealId, phase.codeOnDone);
  const open = await tx
    .select({ id: projectPhases.id })
    .from(projectPhases)
    .where(
      and(
        eq(projectPhases.projectId, phase.projectId),
        inArray(projectPhases.status, ['pending', 'in_progress', 'awaiting_approval']),
      ),
    );
  if (open.length === 0) {
    await tx.update(projects).set({ status: 'completed' }).where(eq(projects.id, phase.projectId));
  }
  await recordAudit(tx, {
    organizationId: phase.organizationId,
    action: 'project.phase_completed',
    resourceType: 'project_phase',
    resourceId: phase.id,
    clientId: phase.clientId,
    metadata: { projectId: phase.projectId },
  });
  return { ok: true };
}

export async function startPhase(
  claims: VerifiedClaims,
  input: { phaseId: string },
  deps: RoomsDeps,
): Promise<{ ok: true } | { ok: false; rule: ProcessRefusal }> {
  if (!(await phaseWriter(deps, claims, input.phaseId))) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  return deps.contexts.withSystemContext(async (tx) => {
    const [phase] = await tx
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.id, input.phaseId));
    if (!phase) return NOT_FOUND;
    const project = await lockProject(tx, phase.projectId);
    if (project?.status !== 'active') return { ok: false as const, rule: 'invalid_state' as const };
    const phases = await tx
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.projectId, phase.projectId));
    const decision = canStartPhase(phases, phase.id);
    if (!decision.ok) return decision;

    await tx
      .update(projectPhases)
      .set({ status: 'in_progress', startedAt: now })
      .where(eq(projectPhases.id, phase.id));
    await tx
      .update(projectSteps)
      .set({ status: 'in_progress' })
      .where(
        and(
          eq(projectSteps.phaseId, phase.id),
          eq(projectSteps.position, 1),
          eq(projectSteps.status, 'todo'),
        ),
      );
    if (phase.codeOnStart && project.dealId) {
      await deps.moveDeal(tx, project.dealId, phase.codeOnStart);
    }
    await recordAudit(tx, {
      organizationId: phase.organizationId,
      action: 'project.phase_started',
      resourceType: 'project_phase',
      resourceId: phase.id,
      clientId: phase.clientId,
      metadata: { projectId: phase.projectId },
    });
    return { ok: true as const };
  });
}

export async function completePhase(
  claims: VerifiedClaims,
  input: { phaseId: string },
  deps: RoomsDeps,
): Promise<{ ok: true } | { ok: false; rule: ProcessRefusal }> {
  if (!(await phaseWriter(deps, claims, input.phaseId))) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();
  return deps.contexts.withSystemContext(async (tx) => {
    const [phase] = await tx
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.id, input.phaseId));
    if (!phase) return NOT_FOUND;
    return completePhaseInTx(tx, phase, deps, now);
  });
}

const STEP_STATUSES: readonly StepStatus[] = ['todo', 'in_progress', 'done'];

/**
 * Changes a step's status. The room's writers change any step; a freelancer or manager who only
 * reads the room changes the steps assigned to them. A done step starts the next chained step and
 * shares it with the client when visible (AUT-14, US-13); reopening a shared step flags it (RN-43).
 */
export async function setStepStatus(
  claims: VerifiedClaims,
  input: { stepId: string; status: StepStatus },
  deps: RoomsDeps,
): Promise<{ ok: true } | { ok: false; rule: ProcessRefusal }> {
  if (!STEP_STATUSES.includes(input.status)) return { ok: false, rule: 'invalid_input' };
  const clientId = await visibleClient(deps.contexts, claims, { stepId: input.stepId });
  if (!clientId) return NOT_FOUND;
  const writer = await roomActor(deps.contexts, claims, clientId, 'write');
  const reader = writer ?? (await roomActor(deps.contexts, claims, clientId, 'read'));
  if (!reader) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(
    async (tx): Promise<{ ok: true; shared: boolean } | { ok: false; rule: ProcessRefusal }> => {
      const [step] = await tx
        .select()
        .from(projectSteps)
        .where(eq(projectSteps.id, input.stepId))
        .for('update');
      if (!step) return NOT_FOUND;
      if (!writer && step.assigneeId !== reader.userId) return NOT_FOUND;
      const [phase] = await tx
        .select({ status: projectPhases.status })
        .from(projectPhases)
        .where(eq(projectPhases.id, step.phaseId));
      if (phase?.status !== 'in_progress') return { ok: false, rule: 'invalid_state' };
      if (step.status === input.status) return { ok: true, shared: false };

      await tx
        .update(projectSteps)
        .set({
          status: input.status,
          completedAt: input.status === 'done' ? now : null,
          reopenedAfterShared:
            step.reopenedAfterShared || (step.sharedAt !== null && step.status === 'done'),
        })
        .where(eq(projectSteps.id, step.id));
      if (step.status === 'done') {
        await tx
          .update(projectSteps)
          .set({ reopenedAfterShared: true })
          .where(
            and(
              eq(projectSteps.phaseId, step.phaseId),
              eq(projectSteps.position, step.position + 1),
              eq(projectSteps.chained, true),
              isNotNull(projectSteps.sharedAt),
            ),
          );
      }
      await recordAudit(tx, {
        organizationId: step.organizationId,
        action: 'project.step_changed',
        resourceType: 'project_step',
        resourceId: step.id,
        clientId: step.clientId,
        metadata: { from: step.status, to: input.status },
      });
      if (input.status !== 'done') return { ok: true, shared: false };

      const siblings = await tx
        .select()
        .from(projectSteps)
        .where(eq(projectSteps.phaseId, step.phaseId))
        .orderBy(asc(projectSteps.position));
      const next = nextChainedStep(siblings, step.id);
      const nextRow = next ? siblings.find((row) => row.id === next.id) : undefined;
      if (!nextRow || nextRow.status !== 'todo') return { ok: true, shared: false };
      await tx
        .update(projectSteps)
        .set({ status: 'in_progress' })
        .where(eq(projectSteps.id, nextRow.id));
      if (!nextRow.visibleToClient || nextRow.sharedAt) return { ok: true, shared: false };
      await shareStep(tx, nextRow, now);
      return { ok: true, shared: true };
    },
  );

  if (!result.ok) return result;
  if (result.shared) await (deps.flush ?? requestFlush)();
  return { ok: true };
}

const stepPatchSchema = z.object({
  stepId: z.uuid(),
  assigneeId: z.uuid().nullable().optional(),
  dueOn: z.iso.date().nullable().optional(),
  visibleToClient: z.boolean().optional(),
});

/**
 * The people who can take work in a client's room: the organisation's founders and the staff
 * assigned to the client (spec decision 6). For work inside a project, a freelancer must also be
 * assigned to that project (RN-51).
 */
export async function isRoomStaff(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
  userId: string,
  projectId?: string | null,
): Promise<boolean> {
  const memberships = await tx
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
        isNull(organizationMemberships.archivedAt),
      ),
    );
  const roles = memberships.map((membership) => membership.role);
  if (roles.includes('founder')) return true;
  if (!roles.includes('project_manager') && !roles.includes('freelancer')) return false;
  const [assignment] = await tx
    .select({ userId: clientStaffAssignments.userId })
    .from(clientStaffAssignments)
    .where(
      and(
        eq(clientStaffAssignments.userId, userId),
        eq(clientStaffAssignments.clientId, clientId),
        isNull(clientStaffAssignments.archivedAt),
      ),
    )
    .limit(1);
  if (!assignment) return false;
  if (!projectId || roles.includes('project_manager')) return true;
  const [projectAssignment] = await tx
    .select({ userId: projectStaffAssignments.userId })
    .from(projectStaffAssignments)
    .where(
      and(
        eq(projectStaffAssignments.userId, userId),
        eq(projectStaffAssignments.projectId, projectId),
        isNull(projectStaffAssignments.archivedAt),
      ),
    )
    .limit(1);
  return projectAssignment !== undefined;
}

/** Assignee, due date and client visibility of a step; making a step visible is audited (RN-50). */
export async function updateStep(
  claims: VerifiedClaims,
  input: {
    stepId: string;
    assigneeId?: string | null;
    dueOn?: string | null;
    visibleToClient?: boolean;
  },
  deps: RoomsDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  const clientId = await visibleClient(deps.contexts, claims, { stepId: input.stepId });
  const actor = clientId ? await roomActor(deps.contexts, claims, clientId, 'write') : null;
  if (!actor || !clientId) return NOT_FOUND;
  const parsed = stepPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, rule: 'invalid_input' };
  const { stepId, ...patch } = parsed.data;

  return deps.contexts.withSystemContext(async (tx) => {
    if (patch.assigneeId) {
      const [step] = await tx
        .select({ projectId: projectSteps.projectId })
        .from(projectSteps)
        .where(eq(projectSteps.id, stepId));
      if (
        !step ||
        !(await isRoomStaff(tx, actor.organizationId, clientId, patch.assigneeId, step.projectId))
      ) {
        return { ok: false as const, rule: 'invalid_input' as const };
      }
    }
    const changed = await tx
      .update(projectSteps)
      .set(patch)
      .where(eq(projectSteps.id, stepId))
      .returning({ id: projectSteps.id });
    if (changed.length === 0) return NOT_FOUND;
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'project.step_updated',
      resourceType: 'project_step',
      resourceId: stepId,
      clientId,
      metadata: patch,
    });
    return { ok: true as const };
  });
}

/** The phase's due date; the project's expected end follows the latest phase due date. */
export async function updatePhase(
  claims: VerifiedClaims,
  input: { phaseId: string; dueOn: string | null },
  deps: RoomsDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  if (!(await phaseWriter(deps, claims, input.phaseId))) return NOT_FOUND;
  if (input.dueOn !== null && !z.iso.date().safeParse(input.dueOn).success) {
    return { ok: false, rule: 'invalid_input' };
  }
  return deps.contexts.withSystemContext(async (tx) => {
    const [phase] = await tx
      .update(projectPhases)
      .set({ dueOn: input.dueOn })
      .where(eq(projectPhases.id, input.phaseId))
      .returning({ projectId: projectPhases.projectId });
    if (!phase) return NOT_FOUND;
    const [latest] = await tx
      .select({ dueOn: max(projectPhases.dueOn) })
      .from(projectPhases)
      .where(eq(projectPhases.projectId, phase.projectId));
    await tx
      .update(projects)
      .set({ endsOn: latest?.dueOn ?? null })
      .where(eq(projects.id, phase.projectId));
    return { ok: true as const };
  });
}
