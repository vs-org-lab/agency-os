import { publicBrandHubByDomain } from '@/modules/brand-hub/server';
import { bearerToken, siteResponse, sitePreflight } from '../../hubs/respond';

type Context = { params: Promise<{ host: string }> };

/** H-03 on a client domain (RF-095): the hub a connected domain serves, with its slug. */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { host } = await context.params;
  const result = await publicBrandHubByDomain(host, bearerToken(request));
  if (result.status === 200)
    return siteResponse(request, 200, { ...result.hub, slug: result.slug });
  if (result.status === 401) {
    return siteResponse(request, 401, {
      mode: result.mode,
      clientName: result.clientName,
      slug: result.slug,
    });
  }
  return siteResponse(request, 404, {});
}

export const OPTIONS = sitePreflight;
