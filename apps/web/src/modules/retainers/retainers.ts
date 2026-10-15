import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  INVALID_INPUT,
  NOT_FOUND,
  nowOf,
  retainerWriter,
  type NotFound,
  type RetainersDeps,
} from './access';
import { RETAINER_LIMIT_KINDS } from './domain/kinds';
import { firstOfMonth, lisbonDay } from './domain/months';

const { projects, retainerLimits, retainers } = schema;

const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
});

/** A quantity with at most one decimal, as limits and usage are kept. */
export const quantity = z
  .string()
  .regex(/^\d{1,5}(\.\d)?$/)
  .refine((value) => Number(value) > 0);

const retainerSchema = z.object({
  clientId: z.uuid(),
  projectId: z.uuid(),
  tier: z.string().trim().min(1).max(40),
  monthlyFee: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  currency: z.enum(['EUR', 'GBP', 'USD', 'AOA']),
  startsOn: isoDate,
  reviewOn: isoDate,
  status: z.enum(['active', 'ended']).default('active'),
  limits: z
    .array(z.object({ kind: z.enum(RETAINER_LIMIT_KINDS), monthlyLimit: quantity }))
    .min(1)
    .max(RETAINER_LIMIT_KINDS.length)
    .refine((limits) => new Set(limits.map((limit) => limit.kind)).size === limits.length),
});

/** What the retainer form sends; every field is checked against the schema before use. */
export type RetainerInput = {
  clientId: string;
  projectId: string;
  tier: string;
  monthlyFee: string;
  currency: string;
  startsOn: string;
  reviewOn: string;
  status?: string;
  limits: { kind: string; monthlyLimit: string }[];
};

/**
 * Creates or edits the retainer of a project (RF-110). The start is the first day of its month,
 * the review lies ahead, and the limits replace the previous ones. A new review date allows a new
 * review reminder (AUT-24).
 */
export async function saveRetainer(
  claims: VerifiedClaims,
  input: RetainerInput,
  deps: RetainersDeps,
): Promise<{ ok: true; id: string } | NotFound | typeof INVALID_INPUT> {
  const parsed = retainerSchema.safeParse(input);
  if (!parsed.success)
    return z.uuid().safeParse(input.clientId).success ? INVALID_INPUT : NOT_FOUND;
  const data = parsed.data;
  const actor = await retainerWriter(claims, data.clientId, deps);
  if (!actor) return NOT_FOUND;
  const now = nowOf(deps);
  const today = lisbonDay(now);
  const startsOn = firstOfMonth(data.startsOn);
  if (data.reviewOn <= today || data.reviewOn <= startsOn) return INVALID_INPUT;

  return deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, data.projectId),
          eq(projects.clientId, data.clientId),
          eq(projects.organizationId, actor.organizationId),
        ),
      );
    if (!project) return INVALID_INPUT;
    const [current] = await tx
      .select({ id: retainers.id, reviewOn: retainers.reviewOn })
      .from(retainers)
      .where(eq(retainers.projectId, project.id))
      .for('update');
    const fields = {
      tier: data.tier,
      monthlyFee: data.monthlyFee,
      currency: data.currency,
      startsOn,
      reviewOn: data.reviewOn,
      status: data.status,
      updatedAt: now,
    };
    let retainerId: string;
    if (current) {
      await tx
        .update(retainers)
        .set({
          ...fields,
          ...(current.reviewOn !== data.reviewOn ? { reviewAlertedFor: null } : {}),
        })
        .where(eq(retainers.id, current.id));
      await tx.delete(retainerLimits).where(eq(retainerLimits.retainerId, current.id));
      retainerId = current.id;
    } else {
      const [created] = await tx
        .insert(retainers)
        .values({
          ...fields,
          organizationId: actor.organizationId,
          clientId: data.clientId,
          projectId: project.id,
          createdBy: actor.userId,
          createdAt: now,
        })
        .returning({ id: retainers.id });
      if (!created) throw new Error('The retainer was not created');
      retainerId = created.id;
    }
    await tx.insert(retainerLimits).values(
      data.limits.map((limit) => ({
        retainerId,
        organizationId: actor.organizationId,
        clientId: data.clientId,
        kind: limit.kind,
        monthlyLimit: limit.monthlyLimit,
      })),
    );
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'retainer.saved',
      resourceType: 'retainer',
      resourceId: retainerId,
      clientId: data.clientId,
      metadata: {
        tier: data.tier,
        limits: data.limits.map((limit) => `${limit.kind}:${limit.monthlyLimit}`),
      },
    });
    return { ok: true as const, id: retainerId };
  });
}
