import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import { MEDIA_LINK_TTL_SECONDS, type BucketStorage } from '@/platform/bucket-storage';
import type { VerifiedClaims } from '@/platform/db';
import {
  chaptersSchema,
  MAX_TESTIMONIAL_VIDEO_BYTES,
  TESTIMONIAL_VIDEO_EXTENSIONS,
  testimonialVideoConfirmSchema,
  testimonialVideoContentType,
  testimonialVideoStartSchema,
  type TestimonialChapter,
  type TestimonialVideoConfirmInput,
  type TestimonialVideoStartInput,
} from './input';
import { isProjectDecisionMaker, type TestimonialDeps } from './service';

const { projects, testimonials } = schema;

export type TestimonialVideoDeps = TestimonialDeps & { storage: BucketStorage };

type Rule = 'not_found' | 'invalid_input';

export type StartTestimonialVideoResult =
  { ok: true; uploadUrl: string } | { ok: false; rule: Rule | 'consent_required' | 'file_type' };

export type ConfirmTestimonialVideoResult =
  { ok: true } | { ok: false; rule: Rule | 'upload_missing' | 'too_large' };

/**
 * The decision maker starts a video testimonial. The row holds the pending upload (and the
 * author's details) until the recording is confirmed; the text of an earlier testimonial stays.
 */
export async function startTestimonialVideo(
  claims: VerifiedClaims,
  input: TestimonialVideoStartInput,
  deps: TestimonialVideoDeps,
): Promise<StartTestimonialVideoResult> {
  const parsed = testimonialVideoStartSchema.safeParse(input);
  if (!parsed.success) {
    return z.uuid().safeParse(input.projectId).success
      ? { ok: false, rule: 'invalid_input' }
      : { ok: false, rule: 'not_found' };
  }
  const data = parsed.data;
  if (!(await isProjectDecisionMaker(claims, data.projectId, deps))) {
    return { ok: false, rule: 'not_found' };
  }
  if (!data.consentRecording) return { ok: false, rule: 'consent_required' };
  const contentType = testimonialVideoContentType(data.contentType);
  if (!contentType) return { ok: false, rule: 'file_type' };

  const path = await deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({ organizationId: projects.organizationId, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, data.projectId));
    if (!project) throw new Error('Testimonial project was not found');
    const videoPath = [
      project.organizationId,
      project.clientId,
      data.projectId,
      `${crypto.randomUUID()}.${TESTIMONIAL_VIDEO_EXTENSIONS[contentType]}`,
    ].join('/');
    const values = {
      authorName: data.authorName,
      authorRole: data.authorRole,
      consentPublish: data.consentPublish,
      authorId: claims.sub,
      videoPath,
      videoContentType: contentType,
      videoStatus: 'pending' as const,
      videoDurationSeconds: null,
      chapters: null,
    };
    const [testimonial] = await tx
      .insert(testimonials)
      .values({ ...values, ...project, projectId: data.projectId, body: '' })
      .onConflictDoUpdate({
        target: testimonials.projectId,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning({ id: testimonials.id });
    if (!testimonial) throw new Error('Testimonial video was not started');
    await recordAudit(tx, {
      organizationId: project.organizationId,
      action: 'testimonial.video_started',
      resourceType: 'testimonial',
      resourceId: testimonial.id,
      clientId: project.clientId,
      metadata: { projectId: data.projectId },
    });
    return videoPath;
  });
  return { ok: true, uploadUrl: await deps.storage.createUploadUrl(path) };
}

/** The recording reached the bucket: the video becomes readable by the team and the founder is told. */
export async function confirmTestimonialVideo(
  claims: VerifiedClaims,
  input: TestimonialVideoConfirmInput,
  deps: TestimonialVideoDeps,
): Promise<ConfirmTestimonialVideoResult> {
  const parsed = testimonialVideoConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return z.uuid().safeParse(input.projectId).success
      ? { ok: false, rule: 'invalid_input' }
      : { ok: false, rule: 'not_found' };
  }
  const data = parsed.data;
  if (!(await isProjectDecisionMaker(claims, data.projectId, deps))) {
    return { ok: false, rule: 'not_found' };
  }

  const result = await deps.contexts.withSystemContext<ConfirmTestimonialVideoResult>(
    async (tx) => {
      const [row] = await tx
        .select()
        .from(testimonials)
        .where(
          and(eq(testimonials.projectId, data.projectId), eq(testimonials.authorId, claims.sub)),
        )
        .for('update');
      if (row?.videoStatus !== 'pending' || !row.videoPath) return { ok: false, rule: 'not_found' };

      const size = await deps.storage.objectSize(row.videoPath);
      if (size === null) return { ok: false, rule: 'upload_missing' };
      if (size > MAX_TESTIMONIAL_VIDEO_BYTES) {
        await deps.storage.remove([row.videoPath]);
        if (row.body === '') {
          await tx.delete(testimonials).where(eq(testimonials.id, row.id));
        } else {
          await tx
            .update(testimonials)
            .set({
              videoPath: null,
              videoContentType: null,
              videoStatus: null,
              videoDurationSeconds: null,
              chapters: null,
            })
            .where(eq(testimonials.id, row.id));
        }
        return { ok: false, rule: 'too_large' };
      }

      await tx
        .update(testimonials)
        .set({
          videoStatus: 'ready',
          videoDurationSeconds: data.durationSeconds,
          chapters: data.chapters,
        })
        .where(eq(testimonials.id, row.id));
      await recordAudit(tx, {
        organizationId: row.organizationId,
        action: 'testimonial.video_uploaded',
        resourceType: 'testimonial',
        resourceId: row.id,
        clientId: row.clientId,
        metadata: { projectId: row.projectId, consentPublish: row.consentPublish },
      });
      await emit(tx, {
        type: 'testimonials.received',
        organizationId: row.organizationId,
        clientId: row.clientId,
        payload: { projectId: row.projectId, testimonialId: row.id },
      });
      return { ok: true };
    },
  );
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}

export type TeamTestimonial = {
  authorName: string;
  authorRole: string;
  body: string;
  consentPublish: boolean;
  video: {
    /** A signed link that expires in minutes. */
    url: string;
    contentType: string;
    durationSeconds: number;
    chapters: TestimonialChapter[];
  } | null;
};

/** The testimonial of a project for the team that reads it, with its video behind a signed link. */
export async function loadTeamTestimonial(
  claims: VerifiedClaims,
  projectId: string,
  deps: TestimonialVideoDeps,
): Promise<TeamTestimonial | null> {
  if (!z.uuid().safeParse(projectId).success) return null;
  const [row] = await deps.contexts.withUserContext(claims, (tx) =>
    tx
      .select({
        authorName: testimonials.authorName,
        authorRole: testimonials.authorRole,
        body: testimonials.body,
        consentPublish: testimonials.consentPublish,
        videoPath: testimonials.videoPath,
        videoContentType: testimonials.videoContentType,
        videoStatus: testimonials.videoStatus,
        videoDurationSeconds: testimonials.videoDurationSeconds,
        chapters: testimonials.chapters,
      })
      .from(testimonials)
      .where(eq(testimonials.projectId, projectId)),
  );
  if (!row) return null;
  const { videoPath, videoContentType, videoDurationSeconds } = row;
  const hasVideo =
    row.videoStatus === 'ready' &&
    videoPath !== null &&
    videoContentType !== null &&
    videoDurationSeconds !== null;
  if (!hasVideo && row.body === '') return null;
  const chapters = chaptersSchema.safeParse(row.chapters);
  return {
    authorName: row.authorName,
    authorRole: row.authorRole,
    body: row.body,
    consentPublish: row.consentPublish,
    video: hasVideo
      ? {
          url: await deps.storage.signedUrl(videoPath, MEDIA_LINK_TTL_SECONDS),
          contentType: videoContentType,
          durationSeconds: videoDurationSeconds,
          chapters: chapters.success ? chapters.data : [],
        }
      : null,
  };
}
