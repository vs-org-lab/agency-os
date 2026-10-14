import { publicBrandHub } from '@/modules/brand-hub/server';
import { bearerToken, siteResponse, sitePreflight } from '../respond';

type Context = { params: Promise<{ slug: string }> };

/** H-03: the current publication of a hub for the published site (SEC-40). */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { slug } = await context.params;
  const result = await publicBrandHub(slug, bearerToken(request));
  if (result.status === 200) return siteResponse(request, 200, result.hub);
  if (result.status === 401) {
    return siteResponse(request, 401, { mode: result.mode, clientName: result.clientName });
  }
  return siteResponse(request, 404, {});
}

export const OPTIONS = sitePreflight;
