'use server';

import type { ReportResult } from '@/components/client-reports/shared';
import type { ReportKind, ReportTexts } from '@/modules/client-reports';
import {
  publishClientReport,
  startClientReport,
  storeClientReport,
} from '@/modules/client-reports/server';
import { getVerifiedClaims } from '@/platform/session';

export async function createClientReportAction(input: {
  clientId: string;
  kind: ReportKind;
  periodStart: string;
}): Promise<{ ok: true; reportId: string } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await startClientReport(claims, input);
  return result.ok ? result : { ok: false, code: result.rule };
}

export async function saveClientReportAction(input: {
  reportId: string;
  texts: ReportTexts;
}): Promise<ReportResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await storeClientReport(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function shareClientReportAction(input: { reportId: string }): Promise<ReportResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await publishClientReport(claims, input.reportId);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}
