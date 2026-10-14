import { publicBrandHubManual } from '@/modules/brand-hub/server';
import { bearerToken, siteResponse, sitePreflight } from '../../respond';

type Context = { params: Promise<{ slug: string }> };

/** RF-093 on the site: a link to the brand manual of the current publication. */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { slug } = await context.params;
  const result = await publicBrandHubManual(slug, bearerToken(request));
  return result.status === 200
    ? siteResponse(request, 200, { url: result.url, fileName: result.fileName })
    : siteResponse(request, result.status, {});
}

export const OPTIONS = sitePreflight;
