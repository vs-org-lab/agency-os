import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbTransaction } from '@agency-os/db';

export type TestimonialView = {
  body: string;
  authorName: string;
  authorRole: string;
  consentPublish: boolean;
  /** A recorded video was sent for this testimonial. */
  hasVideo: boolean;
};

export type ClientTestimonial = { projectName: string; testimonial: TestimonialView | null };

/** The testimonial page: a delivered project of the decision maker's client and what they wrote. */
export async function getClientTestimonial(
  tx: DbTransaction,
  projectId: string,
): Promise<ClientTestimonial | null> {
  if (!z.uuid().safeParse(projectId).success) return null;
  const [row] = await tx.execute<{
    name: string;
    body: string | null;
    author_name: string | null;
    author_role: string | null;
    consent_publish: boolean | null;
    video_status: 'pending' | 'ready' | null;
  }>(sql`
    select p.name, t.body, t.author_name, t.author_role, t.consent_publish, t.video_status
    from public.portal_projects p
    left join public.portal_testimonials t on t.project_id = p.id
    where p.id = ${projectId}::uuid and p.status = 'delivered'
      and app.is_client_member(p.client_id, array['decision_maker']::app.client_role[])
  `);
  if (!row) return null;
  return {
    projectName: row.name,
    testimonial:
      row.body === null
        ? null
        : {
            body: row.body,
            authorName: row.author_name ?? '',
            authorRole: row.author_role ?? '',
            consentPublish: row.consent_publish === true,
            hasVideo: row.video_status === 'ready',
          },
  };
}
