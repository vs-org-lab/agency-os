import { sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { soleClientManager } from '@/modules/rooms/server';
import type { DbContexts } from '@/platform/db';
import { logger } from '@/platform/logger';
import {
  closesQuarter,
  periodOf,
  previousPeriod,
  quarterOf,
  type ReportPeriod,
} from './domain/periods';

const { clientReports, tasks } = schema;

export const QBR_TASK_DAYS = 10;

export function qbrTaskTitle(period: ReportPeriod): string {
  const { quarter, year } = quarterOf(period.start);
  return `Marcar o QBR do T${quarter} ${year}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export type DraftsDeps = { contexts: Pick<DbContexts, 'withSystemContext'> };

/**
 * AUT-25, on the first of each month: every active client with an active retainer that had
 * started by the end of last month gets last month's report draft and, when last month closed a
 * quarter, the QBR draft with the task to schedule the QBR. One transaction per client; drafts
 * are unique per period, so a repeated run creates nothing, and the task comes only with a new
 * QBR draft.
 */
export async function sweepReportDrafts(
  today: string,
  deps: DraftsDeps,
): Promise<{ monthly: number; qbr: number }> {
  const month = previousPeriod('monthly', today);
  const quarter = closesQuarter(month.start) ? periodOf('qbr', month.start) : null;
  const partners = await deps.contexts.withSystemContext((tx) =>
    tx.execute<{ client_id: string; organization_id: string; project_id: string }>(sql`
      select r.client_id, r.organization_id, r.project_id
      from public.retainers r
      join public.clients c on c.id = r.client_id
      where r.status = 'active' and r.starts_on <= ${month.end}::date
        and c.lifecycle = 'active' and c.archived_at is null
    `),
  );

  const created = { monthly: 0, qbr: 0 };
  for (const partner of partners) {
    try {
      const made = await deps.contexts.withSystemContext(async (tx) => {
        const draft = (period: ReportPeriod) =>
          tx
            .insert(clientReports)
            .values({
              organizationId: partner.organization_id,
              clientId: partner.client_id,
              projectId: partner.project_id,
              kind: period.kind,
              periodStart: period.start,
              periodEnd: period.end,
            })
            .onConflictDoNothing()
            .returning({ id: clientReports.id });
        const monthly = await draft(month);
        const qbr = quarter ? await draft(quarter) : [];
        const qbrReport = qbr[0];
        if (quarter && qbrReport) {
          await tx.insert(tasks).values({
            organizationId: partner.organization_id,
            clientId: partner.client_id,
            projectId: partner.project_id,
            title: qbrTaskTitle(quarter),
            assigneeId: await soleClientManager(tx, partner.client_id),
            dueOn: addDays(today, QBR_TASK_DAYS),
          });
          await recordAudit(tx, {
            organizationId: partner.organization_id,
            action: 'client_report.qbr_due',
            resourceType: 'client_report',
            resourceId: qbrReport.id,
            clientId: partner.client_id,
            metadata: { periodStart: quarter.start },
          });
        }
        return { monthly: monthly.length, qbr: qbr.length };
      });
      created.monthly += made.monthly;
      created.qbr += made.qbr;
    } catch (error) {
      logger.error('client_reports.draft_failed', {
        clientId: partner.client_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return created;
}
