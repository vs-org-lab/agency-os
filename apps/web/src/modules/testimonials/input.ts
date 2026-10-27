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

export const TESTIMONIAL_VIDEOS_BUCKET = 'testimonial-videos';
export const TESTIMONIAL_QUESTION_COUNT = 5;
export const MAX_TESTIMONIAL_VIDEO_SECONDS = 300;

/** The bucket limit of the free plan (ADR 0003). */
export const MAX_TESTIMONIAL_VIDEO_BYTES = 52_428_800;

export const TESTIMONIAL_VIDEO_EXTENSIONS = { 'video/webm': 'webm', 'video/mp4': 'mp4' } as const;

export type TestimonialVideoContentType = keyof typeof TESTIMONIAL_VIDEO_EXTENSIONS;

/** Recorders report the container with its codecs ("video/webm;codecs=vp9,opus"). */
export function testimonialVideoContentType(value: string): TestimonialVideoContentType | null {
  const container = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return Object.hasOwn(TESTIMONIAL_VIDEO_EXTENSIONS, container)
    ? (container as TestimonialVideoContentType)
    : null;
}

/** Where each question started in the recording, so the team can jump between answers. */
export const chaptersSchema = z
  .array(
    z.object({
      index: z
        .number()
        .int()
        .min(0)
        .max(TESTIMONIAL_QUESTION_COUNT - 1),
      startedAtMs: z
        .number()
        .int()
        .min(0)
        .max(MAX_TESTIMONIAL_VIDEO_SECONDS * 1000),
    }),
  )
  .max(TESTIMONIAL_QUESTION_COUNT);

export type TestimonialChapter = z.infer<typeof chaptersSchema>[number];

export const testimonialVideoStartSchema = z.object({
  projectId: z.uuid(),
  authorName: z.string().trim().min(1).max(120),
  authorRole: z.string().trim().max(120),
  consentPublish: z.boolean(),
  consentRecording: z.boolean(),
  contentType: z.string().max(100),
});

export const testimonialVideoConfirmSchema = z.object({
  projectId: z.uuid(),
  durationSeconds: z.number().int().min(1).max(MAX_TESTIMONIAL_VIDEO_SECONDS),
  chapters: chaptersSchema,
});

export type TestimonialVideoStartInput = z.input<typeof testimonialVideoStartSchema>;
export type TestimonialVideoConfirmInput = z.input<typeof testimonialVideoConfirmSchema>;
