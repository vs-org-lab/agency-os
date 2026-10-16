import { desc, eq } from 'drizzle-orm';
import { schema, type ClientReportStatus } from '@agency-os/db';
import type { VerifiedClaims } from '@/platform/db';
import {
  loadReportRecord,
  lisbonDay,
  nowOf,
  readsRoom,
  reportWriter,
  type ClientReportsDeps,
} from './access';
import { collectReportData, reportProject } from './collect';
import type { ReportData, ReportTexts } from './domain/content';
import { previousPeriod, type ReportKind, type ReportPeriod } from './domain/periods';
import { documentTitle } from './domain/titles';

const { clientReports } = schema;

export type ClientReportRow = {
  id: string;
  kind: ReportKind;
  periodStart: string;
  periodEnd: string;
  title: string;
  status: ClientReportStatus;
  sharedAt: Date | null;
};

export type ClientReportsView = {
  canWrite: boolean;
  reports: ClientReportRow[];
  /** The finished periods "Novo relatório" offers, newest first. */
  periods: { monthly: string[]; qbr: string[] };
};

export type ClientReportView = {
  id: string;
  clientId: string;
  period: ReportPeriod;
  title: string;
  status: ClientReportStatus;
  sharedAt: Date | null;
  documentId: string | null;
  texts: ReportTexts;
  data: ReportData;
  canWrite: boolean;
};

function recentPeriods(kind: ReportKind, today: string, count: number): string[] {
  const starts: string[] = [];
  for (let day = today; starts.length < count;) {
    const period = previousPeriod(kind, day);
    starts.push(period.start);
    day = period.start;
  }
  return starts;
}

/** C-14: the client's reports for whoever reads the room. */
export async function loadClientReports(
  claims: VerifiedClaims,
  clientId: string,
  deps: ClientReportsDeps,
): Promise<ClientReportsView | null> {
  if (!(await readsRoom(claims, clientId, deps))) return null;
  const rows = await deps.contexts.withUserContext(claims, (tx) =>
    tx
      .select({
        id: clientReports.id,
        kind: clientReports.kind,
        periodStart: clientReports.periodStart,
        periodEnd: clientReports.periodEnd,
        status: clientReports.status,
        sharedAt: clientReports.sharedAt,
      })
      .from(clientReports)
      .where(eq(clientReports.clientId, clientId))
      .orderBy(desc(clientReports.periodStart), clientReports.kind),
  );
  const projectId = await deps.contexts.withSystemContext((tx) => reportProject(tx, clientId));
  const canWrite = projectId
    ? (await reportWriter(claims, { projectId, clientId }, deps)) !== null
    : false;
  const today = lisbonDay(nowOf(deps));
  return {
    canWrite,
    reports: rows.map((row) => ({
      ...row,
      title: documentTitle({ kind: row.kind, start: row.periodStart, end: row.periodEnd }),
    })),
    periods: { monthly: recentPeriods('monthly', today, 12), qbr: recentPeriods('qbr', today, 8) },
  };
}

/** The C-14 editor: the saved texts and the period's data as sharing now would freeze it. */
export async function loadClientReport(
  claims: VerifiedClaims,
  reportId: string,
  deps: ClientReportsDeps,
): Promise<ClientReportView | null> {
  const report = await loadReportRecord(reportId, deps);
  if (!report || !(await readsRoom(claims, report.clientId, deps))) return null;
  const data = await deps.contexts.withSystemContext((tx) =>
    collectReportData(tx, { clientId: report.clientId, period: report.period }),
  );
  return {
    id: report.id,
    clientId: report.clientId,
    period: report.period,
    title: documentTitle(report.period),
    status: report.status,
    sharedAt: report.sharedAt,
    documentId: report.documentId,
    texts: report.texts,
    data,
    canWrite: (await reportWriter(claims, report, deps)) !== null,
  };
}
