import { z } from 'zod';

export const MAX_TESTIMONIAL_LENGTH = 1000;

/** The testimonial form, shared by the portal form and the server service. */
export const testimonialInputSchema = z.object({
  projectId: z.uuid(),
  body: z.string().trim().min(1).max(MAX_TESTIMONIAL_LENGTH),
  authorName: z.string().trim().min(1).max(120),
  authorRole: z.string().trim().max(120),
  consentPublish: z.boolean(),
});

export type TestimonialInput = z.input<typeof testimonialInputSchema>;
