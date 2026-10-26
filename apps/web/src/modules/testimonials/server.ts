import 'server-only';
import { withSystemContext, withUserContext, type VerifiedClaims } from '@/platform/db';
import { createSupabaseBucketStorage } from '@/platform/supabase-bucket-storage';
import {
  TESTIMONIAL_VIDEOS_BUCKET,
  type TestimonialInput,
  type TestimonialVideoConfirmInput,
  type TestimonialVideoStartInput,
} from './input';
import { getClientTestimonial } from './portal';
import { submitTestimonial } from './service';
import { confirmTestimonialVideo, loadTeamTestimonial, startTestimonialVideo } from './video';

const deps = () => ({ contexts: { withUserContext, withSystemContext } });
const videoDeps = () => ({
  ...deps(),
  storage: createSupabaseBucketStorage(TESTIMONIAL_VIDEOS_BUCKET),
});

export function loadClientTestimonial(claims: VerifiedClaims, projectId: string) {
  return withUserContext(claims, (tx) => getClientTestimonial(tx, projectId));
}

export function sendTestimonial(claims: VerifiedClaims, input: TestimonialInput) {
  return submitTestimonial(claims, input, deps());
}

export function beginTestimonialVideo(claims: VerifiedClaims, input: TestimonialVideoStartInput) {
  return startTestimonialVideo(claims, input, videoDeps());
}

export function finishTestimonialVideo(
  claims: VerifiedClaims,
  input: TestimonialVideoConfirmInput,
) {
  return confirmTestimonialVideo(claims, input, videoDeps());
}

export function loadProjectTestimonial(claims: VerifiedClaims, projectId: string) {
  return loadTeamTestimonial(claims, projectId, videoDeps());
}

export { TESTIMONIAL_FUNCTIONS } from './automations';
