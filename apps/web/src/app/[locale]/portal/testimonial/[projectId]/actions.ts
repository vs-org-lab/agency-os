'use server';

import type {
  TestimonialChapter,
  TestimonialInput,
  TestimonialVideoStartInput,
} from '@/modules/testimonials';
import {
  beginTestimonialVideo,
  finishTestimonialVideo,
  sendTestimonial,
} from '@/modules/testimonials/server';
import { getVerifiedClaims } from '@/platform/session';

export async function sendTestimonialAction(
  input: TestimonialInput,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await sendTestimonial(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}

export async function beginTestimonialVideoAction(
  input: TestimonialVideoStartInput,
): Promise<{ ok: true; uploadUrl: string } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await beginTestimonialVideo(claims, input);
  return result.ok ? { ok: true, uploadUrl: result.uploadUrl } : { ok: false, code: result.rule };
}

export async function finishTestimonialVideoAction(input: {
  projectId: string;
  durationSeconds: number;
  chapters: TestimonialChapter[];
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const result = await finishTestimonialVideo(claims, input);
  return result.ok ? { ok: true } : { ok: false, code: result.rule };
}
