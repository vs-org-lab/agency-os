import { and, eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { publishGeneratedPdf } from '@/modules/project-documents/server';
import type { VerifiedClaims } from '@/platform/db';
import {
  isUuid,
  lisbonDay,
  loadReportRecord,
  NOT_FOUND,
  nowOf,
  reportWriter,
  type ClientReportsDeps,
  type NotFound,
  type ReportRecord,
} from './access';
import { collectReportData, reportProject } from './collect';
import { reportTexts, type ReportData } from './domain/content';
import { isFinished, periodOf, type ReportKind } from './domain/periods';
import { documentTitle, pdfFileName } from './domain/titles';
import { monthlyReportPdf, qbrDeckPdf } from './pdf';

const { clientReports } = schema;

const KINDS: readonly string[] = ['monthly', 'qbr'] satisfies ReportKind[];
const DAY = /^\d{4}-\d{2}-01$/;

type InvalidPeriod = { ok: false; rule: 'invalid_period' };
type Exists = { ok: false; rule: 'exists' };
type InvalidInput = { ok: false; rule: 'invalid_input' };

/** RF-130: a report of a month or quarter that has ended, on the client's report project. */
export async function createClientReport(
  claims: VerifiedClaims,
  input: { clientId: string; kind: string; periodStart: string },
  deps: ClientReportsDeps,
): Promise<{ ok: true; reportId: string } | NotFound | InvalidPeriod | Exists> {
  if (!KINDS.includes(input.kind) || !DAY.test(input.periodStart)) {
    return { ok: false, rule: 'invalid_period' };
  }
  const period = periodOf(input.kind as ReportKind, input.periodStart);
  if (period.start !== input.periodStart || !isFinished(period, lisbonDay(nowOf(deps)))) {
    return { ok: false, rule: 'invalid_period' };
  }
  if (!isUuid(input.clientId)) return NOT_FOUND;
  const projectId = await deps.contexts.withSystemContext((tx) =>
    reportProject(tx, input.clientId),
  );
  if (!projectId) return NOT_FOUND;
  const writer = await reportWriter(claims, { projectId, clientId: input.clientId }, deps);
  if (!writer) return NOT_FOUND;

  const reportId = await deps.contexts.withSystemContext(async (tx) => {
    const [created] = await tx
      .insert(clientReports)
      .values({
        organizationId: writer.organizationId,
        clientId: writer.clientId,
        projectId,
        kind: period.kind,
        periodStart: period.start,
        periodEnd: period.end,
        createdBy: writer.actorId,
      })
      .onConflictDoNothing()
      .returning({ id: clientReports.id });
    if (!created) return null;
    await recordAudit(tx, {
      organizationId: writer.organizationId,
      action: 'client_report.created',
      resourceType: 'client_report',
      resourceId: created.id,
      clientId: writer.clientId,
      metadata: { kind: period.kind, periodStart: period.start },
    });
    return created.id;
  });
  return reportId ? { ok: true, reportId } : { ok: false, rule: 'exists' };
}

async function writableReport(
  claims: VerifiedClaims,
  reportId: string,
  deps: ClientReportsDeps,
): Promise<ReportRecord | null> {
  const report = await loadReportRecord(reportId, deps);
  if (!report) return null;
  return (await reportWriter(claims, report, deps)) ? report : null;
}

export async function saveClientReport(
  claims: VerifiedClaims,
  input: { reportId: string; texts: unknown },
  deps: ClientReportsDeps,
): Promise<{ ok: true } | NotFound | InvalidInput> {
  const report = await writableReport(claims, input.reportId, deps);
  if (!report) return NOT_FOUND;
  const texts = reportTexts(report.period.kind, input.texts);
  if (!texts) return { ok: false, rule: 'invalid_input' };
  await deps.contexts.withSystemContext((tx) =>
    tx
      .update(clientReports)
      .set({ ...texts, updatedAt: nowOf(deps) })
      .where(eq(clientReports.id, report.id)),
  );
  return { ok: true };
}

async function renderPdf(report: ReportRecord, data: ReportData): Promise<Uint8Array> {
  const input = {
    clientName: report.clientName,
    period: report.period,
    data,
    texts: report.texts,
  };
  return report.period.kind === 'qbr' ? qbrDeckPdf(input) : monthlyReportPdf(input);
}

/** The PDF as sharing it now would produce it: today's data with the saved texts. */
export async function previewClientReport(
  claims: VerifiedClaims,
  reportId: string,
  deps: ClientReportsDeps,
): Promise<{ ok: true; bytes: Uint8Array; fileName: string } | NotFound> {
  const report = await writableReport(claims, reportId, deps);
  if (!report) return NOT_FOUND;
  const data = await deps.contexts.withSystemContext((tx) =>
    collectReportData(tx, { clientId: report.clientId, period: report.period }),
  );
  return { ok: true, bytes: await renderPdf(report, data), fileName: pdfFileName(report.period) };
}

/**
 * Freezes the period's data and publishes the PDF as the room document whose id is the report's,
 * so every share of the report, concurrent ones included, lands on one document as a new version.
 */
export async function shareClientReport(
  claims: VerifiedClaims,
  reportId: string,
  deps: ClientReportsDeps,
): Promise<{ ok: true; documentId: string } | NotFound> {
  const report = await writableReport(claims, reportId, deps);
  if (!report) return NOT_FOUND;
  const data = await deps.contexts.withSystemContext((tx) =>
    collectReportData(tx, { clientId: report.clientId, period: report.period }),
  );
  const published = await publishGeneratedPdf(
    claims,
    {
      projectId: report.projectId,
      documentId: report.id,
      title: documentTitle(report.period),
      fileName: pdfFileName(report.period),
      bytes: await renderPdf(report, data),
    },
    deps,
  );
  if (!published.ok) return NOT_FOUND;
  const now = nowOf(deps);
  await deps.contexts.withSystemContext(async (tx) => {
    await tx
      .update(clientReports)
      .set({
        status: 'shared',
        data,
        documentId: published.documentId,
        sharedAt: now,
        updatedAt: now,
      })
      .where(and(eq(clientReports.id, report.id)));
    await recordAudit(tx, {
      organizationId: report.organizationId,
      action: 'client_report.shared',
      resourceType: 'client_report',
      resourceId: report.id,
      clientId: report.clientId,
      metadata: { versionId: published.versionId },
    });
  });
  return { ok: true, documentId: published.documentId };
}
