import { eq, sql } from 'drizzle-orm';
import { schema, type ClientReportKind, type ClientReportStatus } from '@agency-os/db';
import { documentEditor, type DocumentsDeps } from '@/modules/project-documents/server';
import type { VerifiedClaims } from '@/platform/db';
import type { ReportPeriod } from './domain/periods';

const { clientReports, clients } = schema;

export type ClientReportsDeps = DocumentsDeps;

export type NotFound = { ok: false; rule: 'not_found' };
export const NOT_FOUND: NotFound = { ok: false, rule: 'not_found' };

export const nowOf = (deps: ClientReportsDeps) => (deps.now ?? (() => new Date()))();

const lisbonDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' });
export const lisbonDay = (instant: Date) => lisbonDate.format(instant);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

export type ReportRecord = {
  id: string;
  organizationId: string;
  clientId: string;
  clientName: string;
  projectId: string;
  period: ReportPeriod;
  status: ClientReportStatus;
  texts: { summary: string; highlights: string; nextSteps: string; priorities: string };
  documentId: string | null;
  sharedAt: Date | null;
};

/** The report row, read in the system context; callers decide who may see it. */
export async function loadReportRecord(
  reportId: string,
  deps: ClientReportsDeps,
): Promise<ReportRecord | null> {
  if (!isUuid(reportId)) return null;
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        id: clientReports.id,
        organizationId: clientReports.organizationId,
        clientId: clientReports.clientId,
        clientName: clients.name,
        projectId: clientReports.projectId,
        kind: clientReports.kind,
        start: clientReports.periodStart,
        end: clientReports.periodEnd,
        status: clientReports.status,
        summary: clientReports.summary,
        highlights: clientReports.highlights,
        nextSteps: clientReports.nextSteps,
        priorities: clientReports.priorities,
        documentId: clientReports.documentId,
        sharedAt: clientReports.sharedAt,
      })
      .from(clientReports)
      .innerJoin(clients, eq(clients.id, clientReports.clientId))
      .where(eq(clientReports.id, reportId)),
  );
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    clientName: row.clientName,
    projectId: row.projectId,
    period: { kind: row.kind as ClientReportKind, start: row.start, end: row.end },
    status: row.status,
    texts: {
      summary: row.summary,
      highlights: row.highlights,
      nextSteps: row.nextSteps,
      priorities: row.priorities,
    },
    documentId: row.documentId,
    sharedAt: row.sharedAt,
  };
}

/** Writing a report follows the room documents (C-04): whoever edits the project's documents. */
export async function reportWriter(
  claims: VerifiedClaims,
  report: { projectId: string; clientId: string },
  deps: ClientReportsDeps,
) {
  const editor = await documentEditor(claims, report.projectId, deps);
  return editor && editor.clientId === report.clientId ? editor : null;
}

/** Reading the reports list and drafts: whoever reads the client's room. */
export async function readsRoom(
  claims: VerifiedClaims,
  clientId: string,
  deps: ClientReportsDeps,
): Promise<boolean> {
  if (claims.user_kind === 'client' || !isUuid(clientId)) return false;
  const [client] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ organizationId: clients.organizationId })
      .from(clients)
      .where(eq(clients.id, clientId)),
  );
  if (!client) return false;
  const [row] = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ reads: boolean }>(
      sql`select app.can_read_rooms(${client.organizationId}::uuid, ${clientId}::uuid) as reads`,
    ),
  );
  return row?.reads === true;
}
