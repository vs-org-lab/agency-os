'use server';

import type { TestimonialInput } from '@/modules/testimonials';
import { sendTestimonial } from '@/modules/testimonials/server';
import { getVerifiedClaims } from '@/platform/session';

export async function sendTestimonialAction(
  input: TestimonialInput,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await sendTestimonial(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}
