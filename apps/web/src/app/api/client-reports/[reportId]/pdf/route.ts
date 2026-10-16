import { NextResponse } from 'next/server';
import { clientReportPreview } from '@/modules/client-reports/server';
import { getVerifiedClaims } from '@/platform/session';

/** C-14: the report's PDF as sharing it now would produce it, for its writers only. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string }> },
): Promise<Response> {
  const { reportId } = await context.params;
  const claims = await getVerifiedClaims();
  if (!claims) return new NextResponse(null, { status: 404 });
  const preview = await clientReportPreview(claims, reportId);
  if (!preview.ok) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(preview.bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${preview.fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
