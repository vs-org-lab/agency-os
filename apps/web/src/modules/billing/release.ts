import { and, eq } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';

const { approvals, projects } = schema;

type ReleasableMilestone = Pick<
  typeof schema.billingMilestones.$inferSelect,
  'trigger' | 'phaseId' | 'dealId'
>;

/**
 * RN-32: a milestone linked to a phase waits for that phase's approval, and the delivery milestone
 * waits for the deal's project to be delivered. Signature milestones and unlinked phase milestones
 * are never locked.
 */
export async function milestoneLocked(
  tx: DbTransaction,
  milestone: ReleasableMilestone,
): Promise<boolean> {
  if (milestone.trigger === 'phase_approval' && milestone.phaseId) {
    const [approved] = await tx
      .select({ id: approvals.id })
      .from(approvals)
      .where(
        and(
          eq(approvals.subjectType, 'phase'),
          eq(approvals.subjectId, milestone.phaseId),
          eq(approvals.status, 'approved'),
        ),
      )
      .limit(1);
    return !approved;
  }
  if (milestone.trigger === 'delivery') {
    const [delivered] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.dealId, milestone.dealId), eq(projects.status, 'delivered')))
      .limit(1);
    return !delivered;
  }
  return false;
}
