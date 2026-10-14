import { z } from 'zod';
import { unlockPublicBrandHub } from '@/modules/brand-hub/server';
import { clientIpAddress } from '@/platform/request';
import { siteResponse, sitePreflight } from '../../respond';

type Context = { params: Promise<{ slug: string }> };

const body = z.object({ password: z.string().max(256) });

/** RF-096: the password gate of the site; five attempts per hub and address in 15 minutes. */
export async function POST(request: Request, context: Context): Promise<Response> {
  const { slug } = await context.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return siteResponse(request, 400, {});
  const result = await unlockPublicBrandHub(
    slug,
    parsed.data.password,
    clientIpAddress(request.headers) ?? 'unknown',
  );
  if (result.ok) return siteResponse(request, 200, { token: result.token });
  const status = { not_found: 404, invalid_input: 401, rate_limited: 429 }[result.rule];
  return siteResponse(request, status, {});
}

export const OPTIONS = sitePreflight;
