import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { ReportsDeps } from './access';
import { reportCsv, type ReportPanel } from './csv-panels';
import { reportsPdf } from './pdf';
import { loadReports } from './readers';

const deps = (): ReportsDeps => ({ contexts: { withUserContext, withSystemContext } });

export const loadTeamReports = (claims: VerifiedClaims, year: number) =>
  loadReports(claims, year, deps());
export const loadReportCsv = (claims: VerifiedClaims, panel: ReportPanel, year: number) =>
  reportCsv(claims, panel, year, deps());

/** RF-132: the six S-11 panels as one PDF, for founders only. */
export async function loadReportsPdf(claims: VerifiedClaims, year: number) {
  const view = await loadReports(claims, year, deps());
  if (!view) return null;
  return { filename: `relatorios-${year}.pdf`, body: await reportsPdf(view, new Date()) };
}
