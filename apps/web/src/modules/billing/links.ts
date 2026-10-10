import { and, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { writesBillingRow } from './authorize';
import { linkMilestonesToPhases } from './domain/links';
import { milestoneLocked } from './release';
import { issueRequest, type BillingDeps } from './requests';

const { approvals, billingMilestones, projectPhases, projects } = schema;

type NotFound = { ok: false; rule: 'not_found' };
const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };
const uuid = z.uuid();

type MilestoneRow = typeof billingMilestones.$inferSelect;

/** Issues the request of each pending milestone that is no longer locked (AUT-16, final invoice). */
async function issueReleased(
  tx: DbTransaction,
  milestones: readonly MilestoneRow[],
  deps: BillingDeps,
  now: Date,
): Promise<string[]> {
  const requested: string[] = [];
  for (const milestone of [...milestones].sort((left, right) => left.position - right.position)) {
    if (milestone.status !== 'pending' || (await milestoneLocked(tx, milestone))) continue;
    await issueRequest(tx, milestone, deps, now);
    requested.push(milestone.id);
  }
  return requested;
}

async function finish<T extends { requested: string[] }>(result: T, deps: BillingDeps): Promise<T> {
  if (result.requested.length > 0) await (deps.flush ?? requestFlush)();
  return result;
}

/**
 * Links the deal's pending phase-approval milestones to the project's approval phases, in order,
 * when the project is created (spec 2D.2, decision 2). Repeated calls link nothing new.
 */
export async function linkProjectPhases(
  projectId: string,
  deps: BillingDeps,
): Promise<{ linked: number }> {
  if (!uuid.safeParse(projectId).success) return { linked: 0 };
  return deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({ dealId: projects.dealId })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project?.dealId) return { linked: 0 };
    const milestones = await tx
      .select()
      .from(billingMilestones)
      .where(eq(billingMilestones.dealId, project.dealId))
      .for('update');
    const phases = await tx
      .select({
        id: projectPhases.id,
        position: projectPhases.position,
        requiresApproval: projectPhases.requiresApproval,
      })
      .from(projectPhases)
      .where(eq(projectPhases.projectId, projectId));
    const links = linkMilestonesToPhases(milestones, phases);
    for (const link of links) {
      await tx
        .update(billingMilestones)
        .set({ phaseId: link.phaseId })
        .where(eq(billingMilestones.id, link.milestoneId));
    }
    return { linked: links.length };
  });
}

/**
 * The founder or finance moves a pending phase-approval milestone to another approval phase of the
 * deal's project that is not done yet, or unlinks it.
 */
export async function setMilestonePhase(
  claims: VerifiedClaims,
  input: { milestoneId: string; phaseId: string | null },
  deps: BillingDeps,
): Promise<{ ok: true } | NotFound | { ok: false; rule: 'invalid_state' | 'invalid_phase' }> {
  if (!uuid.safeParse(input.milestoneId).success) return NOT_FOUND;
  if (input.phaseId !== null && !uuid.safeParse(input.phaseId).success) {
    return { ok: false, rule: 'invalid_phase' };
  }
  const allowed = await writesBillingRow(deps.contexts, claims, {
    kind: 'milestone',
    id: input.milestoneId,
  });
  if (!allowed) return NOT_FOUND;

  return deps.contexts.withSystemContext(async (tx) => {
    const [milestone] = await tx
      .select()
      .from(billingMilestones)
      .where(eq(billingMilestones.id, input.milestoneId))
      .for('update');
    if (!milestone) return NOT_FOUND;
    if (milestone.trigger !== 'phase_approval' || milestone.status !== 'pending') {
      return { ok: false as const, rule: 'invalid_state' as const };
    }
    if (input.phaseId) {
      const [phase] = await tx
        .select({ id: projectPhases.id })
        .from(projectPhases)
        .innerJoin(projects, eq(projects.id, projectPhases.projectId))
        .where(
          and(
            eq(projectPhases.id, input.phaseId),
            eq(projects.dealId, milestone.dealId),
            eq(projectPhases.requiresApproval, true),
            ne(projectPhases.status, 'done'),
          ),
        );
      if (!phase) return { ok: false as const, rule: 'invalid_phase' as const };
    }
    await tx
      .update(billingMilestones)
      .set({ phaseId: input.phaseId })
      .where(eq(billingMilestones.id, milestone.id));
    await recordAudit(tx, {
      organizationId: milestone.organizationId,
      action: 'billing_milestone.phase_set',
      resourceType: 'billing_milestone',
      resourceId: milestone.id,
      clientId: milestone.clientId,
      metadata: { phaseId: input.phaseId },
    });
    return { ok: true as const };
  });
}

/** AUT-16: the pending milestones linked to an approved phase get their requests, once. */
export async function requestMilestonesForPhase(
  phaseId: string,
  deps: BillingDeps,
): Promise<{ requested: string[] }> {
  if (!uuid.safeParse(phaseId).success) return { requested: [] };
  const now = (deps.now ?? (() => new Date()))();
  const result = await deps.contexts.withSystemContext(async (tx) => {
    const milestones = await tx
      .select()
      .from(billingMilestones)
      .where(and(eq(billingMilestones.phaseId, phaseId), eq(billingMilestones.status, 'pending')))
      .for('update');
    return { requested: await issueReleased(tx, milestones, deps, now) };
  });
  return finish(result, deps);
}

/** The phase behind an approved phase approval, for the AUT-16 automation. */
export async function approvedPhaseOf(
  approvalId: string,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'> },
): Promise<string | null> {
  if (!uuid.safeParse(approvalId).success) return null;
  const [approval] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ subjectId: approvals.subjectId })
      .from(approvals)
      .where(
        and(
          eq(approvals.id, approvalId),
          eq(approvals.subjectType, 'phase'),
          eq(approvals.status, 'approved'),
        ),
      ),
  );
  return approval?.subjectId ?? null;
}

/** AUT-21: the final invoice, the pending delivery milestones of a delivered project's deal. */
export async function requestDeliveryMilestones(
  projectId: string,
  deps: BillingDeps,
): Promise<{ requested: string[] }> {
  if (!uuid.safeParse(projectId).success) return { requested: [] };
  const now = (deps.now ?? (() => new Date()))();
  const result = await deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({ dealId: projects.dealId, status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project?.dealId || project.status !== 'delivered') return { requested: [] };
    const milestones = await tx
      .select()
      .from(billingMilestones)
      .where(
        and(
          eq(billingMilestones.dealId, project.dealId),
          eq(billingMilestones.trigger, 'delivery'),
          inArray(billingMilestones.status, ['pending']),
        ),
      )
      .for('update');
    return { requested: await issueReleased(tx, milestones, deps, now) };
  });
  return finish(result, deps);
}
