import { NextResponse } from 'next/server';
import { REPORT_PANELS, reportYear, type ReportPanel } from '@/modules/reports';
import { loadReportCsv } from '@/modules/reports/server';
import { getVerifiedClaims } from '@/platform/session';

const isPanel = (value: string): value is ReportPanel =>
  (REPORT_PANELS as readonly string[]).includes(value);

/** RF-132: one S-11 panel as CSV (`/api/reports/<panel>.csv?year=YYYY`), for founders only. */
export async function GET(
  request: Request,
  context: { params: Promise<{ panel: string }> },
): Promise<Response> {
  const { panel: file } = await context.params;
  const panel = file.replace(/\.csv$/, '');
  // The CSV always names its year; the screen's default does not apply to a download link.
  const requested = new URL(request.url).searchParams.get('year');
  const year = requested ? reportYear(requested, 0) : null;
  const claims = await getVerifiedClaims();
  if (!claims || !isPanel(panel) || year === null) {
    return new NextResponse(null, { status: 404 });
  }
  const csv = await loadReportCsv(claims, panel, year);
  if (!csv) return new NextResponse(null, { status: 404 });
  return new NextResponse(csv.body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csv.filename}"`,
      'cache-control': 'no-store',
    },
  });
}
