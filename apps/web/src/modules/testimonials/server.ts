import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { getClientTestimonial } from './portal';
import type { TestimonialInput } from './input';
import { submitTestimonial } from './service';

const deps = () => ({ contexts: { withUserContext, withSystemContext } });

export function loadClientTestimonial(claims: VerifiedClaims, projectId: string) {
  return withUserContext(claims, (tx) => getClientTestimonial(tx, projectId));
}

export function sendTestimonial(claims: VerifiedClaims, input: TestimonialInput) {
  return submitTestimonial(claims, input, deps());
}

export { TESTIMONIAL_FUNCTIONS } from './automations';
