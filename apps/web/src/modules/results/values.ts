import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import type { VerifiedClaims } from '@/platform/db';
import { INVALID_INPUT, NOT_FOUND, nowOf, resultsWriter, type ResultsDeps } from './access';
import { currentMonth, isMonth } from './domain/months';

const { clientKpis, clientKpiValues } = schema;

const valuesSchema = z.object({
  clientId: z.uuid(),
  origin: z.enum(['manual', 'csv']),
  values: z
    .array(
      z.object({
        kpiId: z.uuid(),
        month: z.string().refine(isMonth),
        value: z.union([z.number(), z.string().trim()]).transform((raw, context) => {
          const value = typeof raw === 'number' ? raw : Number(raw);
          if (!Number.isFinite(value) || Math.abs(value) >= 1e12) {
            context.addIssue({ code: 'custom', message: 'not a number' });
            return z.NEVER;
          }
          return value.toFixed(4);
        }),
      }),
    )
    .min(1)
    .max(500),
});

export type KpiValuesInput = z.input<typeof valuesSchema>;

/**
 * Records monthly values of the client's live indicators; a month already recorded is replaced.
 * Months after the current Lisbon month and indicators of another client are refused.
 */
export async function recordKpiValues(
  claims: VerifiedClaims,
  input: KpiValuesInput,
  deps: ResultsDeps,
): Promise<{ ok: true; count: number } | typeof NOT_FOUND | typeof INVALID_INPUT> {
  const parsed = valuesSchema.safeParse(input);
  if (!parsed.success)
    return z.uuid().safeParse(input.clientId).success ? INVALID_INPUT : NOT_FOUND;
  const data = parsed.data;
  const actor = await resultsWriter(claims, data.clientId, deps);
  if (!actor) return NOT_FOUND;
  const latest = currentMonth(nowOf(deps));
  if (data.values.some((entry) => entry.month > latest)) return INVALID_INPUT;

  return deps.contexts.withSystemContext(async (tx) => {
    const kpiIds = [...new Set(data.values.map((entry) => entry.kpiId))];
    const owned = await tx
      .select({ id: clientKpis.id })
      .from(clientKpis)
      .where(
        and(
          inArray(clientKpis.id, kpiIds),
          eq(clientKpis.clientId, data.clientId),
          eq(clientKpis.organizationId, actor.organizationId),
          isNull(clientKpis.archivedAt),
        ),
      );
    if (owned.length !== kpiIds.length) return INVALID_INPUT;

    const latestPerMonth = new Map(
      data.values.map((entry) => [`${entry.kpiId}:${entry.month}`, entry] as const),
    );
    await tx
      .insert(clientKpiValues)
      .values(
        [...latestPerMonth.values()].map((entry) => ({
          organizationId: actor.organizationId,
          clientId: data.clientId,
          kpiId: entry.kpiId,
          month: entry.month,
          value: entry.value,
          origin: data.origin,
          recordedBy: actor.userId,
        })),
      )
      .onConflictDoUpdate({
        target: [clientKpiValues.kpiId, clientKpiValues.month],
        set: {
          value: sql`excluded.value`,
          origin: sql`excluded.origin`,
          recordedBy: sql`excluded.recorded_by`,
          updatedAt: sql`now()`,
        },
      });
    await recordAudit(tx, {
      organizationId: actor.organizationId,
      action: 'results.values_recorded',
      resourceType: 'client',
      resourceId: data.clientId,
      clientId: data.clientId,
      metadata: { origin: data.origin, count: data.values.length },
    });
    return { ok: true as const, count: data.values.length };
  });
}
