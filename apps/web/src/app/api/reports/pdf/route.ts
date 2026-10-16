import { NextResponse } from 'next/server';
import { reportYear } from '@/modules/reports';
import { loadReportsPdf } from '@/modules/reports/server';
import { getVerifiedClaims } from '@/platform/session';

const lisbonYear = () =>
  Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date()).slice(0, 4),
  );

/** RF-132: the S-11 panels as PDF (`/api/reports/pdf?year=YYYY`), for founders only. */
export async function GET(request: Request): Promise<Response> {
  const year = reportYear(new URL(request.url).searchParams.get('year'), lisbonYear());
  const claims = await getVerifiedClaims();
  if (!claims || year === null) return new NextResponse(null, { status: 404 });
  const pdf = await loadReportsPdf(claims, year);
  if (!pdf) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(pdf.body), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${pdf.filename}"`,
      'cache-control': 'no-store',
    },
  });
}
