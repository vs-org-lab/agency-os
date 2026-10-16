import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import type { ReportsDeps } from './access';
import { reportCsv, type ReportPanel } from './csv-panels';
import { loadReports } from './readers';

const deps = (): ReportsDeps => ({ contexts: { withUserContext, withSystemContext } });

export const loadTeamReports = (claims: VerifiedClaims, year: number) =>
  loadReports(claims, year, deps());
export const loadReportCsv = (claims: VerifiedClaims, panel: ReportPanel, year: number) =>
  reportCsv(claims, panel, year, deps());
