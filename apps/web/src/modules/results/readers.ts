import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import { nowOf, resultsReader, type ResultsDeps } from './access';
import type { KpiAggregation } from './domain/csv';
import { currentMonth, monthsUpTo } from './domain/months';

const { clientKpis, clientKpiValues } = schema;

export type KpiFormat = 'number' | 'percent' | 'currency' | 'ratio';

export type KpiPoint = { month: string; value: number };

export type ClientKpiView = {
  id: string;
  name: string;
  format: KpiFormat;
  aggregation: KpiAggregation;
  source: string;
  target: number | null;
  clientVisible: boolean;
  values: KpiPoint[];
};

export type ClientResultsView = { currentMonth: string; kpis: ClientKpiView[] };

export type PortalKpiView = Omit<ClientKpiView, 'aggregation' | 'clientVisible'>;

const toNumber = (value: string | null) => (value === null ? null : Number(value));

/** The client's live indicators with the last twelve months of values, for the room. */
export async function loadClientResults(
  claims: VerifiedClaims,
  clientId: string,
  deps: ResultsDeps,
): Promise<ClientResultsView | null> {
  const actor = await resultsReader(claims, clientId, deps);
  if (!actor) return null;
  const month = currentMonth(nowOf(deps));
  const [since] = monthsUpTo(month, 12);

  return deps.contexts.withUserContext(claims, async (tx) => {
    const kpis = await tx
      .select()
      .from(clientKpis)
      .where(and(eq(clientKpis.clientId, clientId), isNull(clientKpis.archivedAt)))
      .orderBy(asc(clientKpis.position), asc(clientKpis.createdAt));
    const values =
      kpis.length === 0
        ? []
        : await tx
            .select({
              kpiId: clientKpiValues.kpiId,
              month: sql<string>`${clientKpiValues.month}::text`,
              value: clientKpiValues.value,
            })
            .from(clientKpiValues)
            .where(
              and(
                inArray(
                  clientKpiValues.kpiId,
                  kpis.map((kpi) => kpi.id),
                ),
                gte(clientKpiValues.month, since ?? month),
              ),
            )
            .orderBy(asc(clientKpiValues.month));

    return {
      currentMonth: month,
      kpis: kpis.map((kpi) => ({
        id: kpi.id,
        name: kpi.name,
        format: kpi.format,
        aggregation: kpi.aggregation,
        source: kpi.source,
        target: toNumber(kpi.target),
        clientVisible: kpi.clientVisible,
        values: values
          .filter((entry) => entry.kpiId === kpi.id)
          .map((entry) => ({ month: entry.month, value: Number(entry.value) })),
      })),
    };
  });
}

const portalRow = z.object({
  kpi_id: z.string(),
  name: z.string(),
  format: z.enum(['number', 'percent', 'currency', 'ratio']),
  source: z.string(),
  target: z.union([z.string(), z.number()]).nullable(),
  month: z.union([z.string(), z.date()]).nullable(),
  value: z.union([z.string(), z.number()]).nullable(),
});

/** What the client sees: its visible, live indicators, read through the results function. */
export async function loadPortalResults(
  claims: VerifiedClaims,
  clientId: string,
  deps: ResultsDeps,
): Promise<PortalKpiView[]> {
  if (!z.uuid().safeParse(clientId).success) return [];
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute(
      sql`select kpi_id, name, format::text as format, source, target, month::text as month, value from app.client_kpi_results(${clientId}::uuid)`,
    ),
  );
  const byKpi = new Map<string, PortalKpiView>();
  for (const raw of rows) {
    const row = portalRow.parse(raw);
    const kpi = byKpi.get(row.kpi_id) ?? {
      id: row.kpi_id,
      name: row.name,
      format: row.format,
      source: row.source,
      target: row.target === null ? null : Number(row.target),
      values: [],
    };
    if (row.month !== null && row.value !== null) {
      kpi.values.push({
        month: typeof row.month === 'string' ? row.month : row.month.toISOString().slice(0, 10),
        value: Number(row.value),
      });
    }
    byKpi.set(row.kpi_id, kpi);
  }
  return [...byKpi.values()];
}
