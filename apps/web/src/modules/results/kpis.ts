import { and, eq, isNull, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import {
  DUPLICATE_NAME,
  INVALID_INPUT,
  NOT_FOUND,
  resultsWriter,
  type ResultsDeps,
} from './access';

const { clientKpis } = schema;

const numeric = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,4})?$/);

const kpiSchema = z.object({
  clientId: z.uuid(),
  kpiId: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  format: z.enum(['number', 'percent', 'currency', 'ratio']),
  aggregation: z.enum(['sum', 'average', 'last']),
  source: z.string().trim().max(40),
  target: numeric.nullable(),
  clientVisible: z.boolean(),
});

export type KpiInput = z.input<typeof kpiSchema>;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { code?: string }).code === '23505' ||
    (error as { cause?: { code?: string } }).cause?.code === '23505');

/** Creates an indicator, or updates it when `kpiId` is given; names are unique per client. */
export async function saveKpi(
  claims: VerifiedClaims,
  input: KpiInput,
  deps: ResultsDeps,
): Promise<
  { ok: true; kpiId: string } | typeof NOT_FOUND | typeof INVALID_INPUT | typeof DUPLICATE_NAME
> {
  const parsed = kpiSchema.safeParse(input);
  if (!parsed.success)
    return z.uuid().safeParse(input.clientId).success ? INVALID_INPUT : NOT_FOUND;
  const data = parsed.data;
  const actor = await resultsWriter(claims, data.clientId, deps);
  if (!actor) return NOT_FOUND;

  try {
    return await deps.contexts.withSystemContext(async (tx) => {
      const fields = {
        name: data.name,
        format: data.format,
        aggregation: data.aggregation,
        source: data.source,
        target: data.target,
        clientVisible: data.clientVisible,
      };
      let kpiId: string;
      if (data.kpiId) {
        const [updated] = await tx
          .update(clientKpis)
          .set(fields)
          .where(
            and(
              eq(clientKpis.id, data.kpiId),
              eq(clientKpis.clientId, data.clientId),
              eq(clientKpis.organizationId, actor.organizationId),
              isNull(clientKpis.archivedAt),
            ),
          )
          .returning({ id: clientKpis.id });
        if (!updated) return NOT_FOUND;
        kpiId = updated.id;
      } else {
        const [last] = await tx
          .select({ position: max(clientKpis.position) })
          .from(clientKpis)
          .where(eq(clientKpis.clientId, data.clientId));
        const [created] = await tx
          .insert(clientKpis)
          .values({
            ...fields,
            organizationId: actor.organizationId,
            clientId: data.clientId,
            position: (last?.position ?? -1) + 1,
            createdBy: actor.userId,
          })
          .returning({ id: clientKpis.id });
        if (!created) return NOT_FOUND;
        kpiId = created.id;
      }
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        action: 'results.kpi_saved',
        resourceType: 'client_kpi',
        resourceId: kpiId,
        clientId: data.clientId,
        metadata: { created: !data.kpiId },
      });
      return { ok: true as const, kpiId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return DUPLICATE_NAME;
    throw error;
  }
}

/** Archives an indicator: it leaves the room and the portal, its values are kept. */
export async function archiveKpi(
  claims: VerifiedClaims,
  input: { kpiId: string },
  deps: ResultsDeps,
): Promise<{ ok: true } | typeof NOT_FOUND> {
  if (!z.uuid().safeParse(input.kpiId).success) return NOT_FOUND;
  const [owner] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ clientId: clientKpis.clientId })
      .from(clientKpis)
      .where(and(eq(clientKpis.id, input.kpiId), isNull(clientKpis.archivedAt))),
  );
  if (!owner) return NOT_FOUND;
  const actor = await resultsWriter(claims, owner.clientId, deps);
  if (!actor) return NOT_FOUND;
  await deps.contexts.withSystemContext(async (tx) => {
    await tx
      .update(clientKpis)
      .set({ archivedAt: sql`now()` })
      .where(
        and(eq(clientKpis.id, input.kpiId), eq(clientKpis.organizationId, actor.organizationId)),
      );
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'results.kpi_archived',
      resourceType: 'client_kpi',
      resourceId: input.kpiId,
      clientId: owner.clientId,
    });
  });
  return { ok: true };
}
