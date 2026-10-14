import { z } from 'zod';
import { publicBrandHubZip } from '@/modules/brand-hub/server';
import { bearerToken, siteResponse, sitePreflight } from '../../respond';

type Context = { params: Promise<{ slug: string }> };

/** RF-093 on the site: the ZIP manifest of one page, or of every asset, of the publication. */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { slug } = await context.params;
  const page = new URL(request.url).searchParams.get('page');
  if (page !== null && !z.uuid().safeParse(page).success) return siteResponse(request, 404, {});
  const result = await publicBrandHubZip(slug, bearerToken(request), page);
  return result.status === 200
    ? siteResponse(request, 200, result.manifest)
    : siteResponse(request, result.status, {});
}

export const OPTIONS = sitePreflight;
