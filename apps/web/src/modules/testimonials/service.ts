import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { DbContexts, VerifiedClaims } from '@/platform/db';
import { testimonialInputSchema, type TestimonialInput } from './input';

const { testimonials } = schema;

export type TestimonialDeps = {
  contexts: Pick<DbContexts, 'withUserContext' | 'withSystemContext'>;
  flush?: () => Promise<void>;
};

/** The client's decision maker of a delivered project, the only one who speaks for it. */
export async function isProjectDecisionMaker(
  claims: VerifiedClaims,
  projectId: string,
  deps: Pick<TestimonialDeps, 'contexts'>,
): Promise<boolean> {
  return deps.contexts.withUserContext(claims, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      select p.id from public.portal_projects p
      where p.id = ${projectId}::uuid and p.status = 'delivered'
        and app.is_client_member(p.client_id, array['decision_maker']::app.client_role[])
    `);
    return rows.length > 0;
  });
}

/**
 * The client's decision maker leaves, or replaces, the testimonial of a delivered project
 * (AUT-21, spec 2D.2 decision 8). The founder is told through `testimonials.received`.
 */
export async function submitTestimonial(
  claims: VerifiedClaims,
  input: TestimonialInput,
  deps: TestimonialDeps,
): Promise<{ ok: true } | { ok: false; rule: 'not_found' | 'invalid_input' }> {
  const parsed = testimonialInputSchema.safeParse(input);
  if (!parsed.success) {
    return z.uuid().safeParse(input.projectId).success
      ? { ok: false, rule: 'invalid_input' }
      : { ok: false, rule: 'not_found' };
  }
  const data = parsed.data;
  const allowed = await isProjectDecisionMaker(claims, data.projectId, deps);
  if (!allowed) return { ok: false, rule: 'not_found' };

  await deps.contexts.withSystemContext(async (tx) => {
    const [project] = await tx
      .select({
        organizationId: schema.projects.organizationId,
        clientId: schema.projects.clientId,
      })
      .from(schema.projects)
      .where(sql`${schema.projects.id} = ${data.projectId}::uuid`);
    if (!project) throw new Error('Testimonial project was not found');
    const values = {
      body: data.body,
      authorName: data.authorName,
      authorRole: data.authorRole,
      consentPublish: data.consentPublish,
      authorId: claims.sub,
    };
    const [testimonial] = await tx
      .insert(testimonials)
      .values({ ...values, ...project, projectId: data.projectId })
      .onConflictDoUpdate({
        target: testimonials.projectId,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning({ id: testimonials.id });
    if (!testimonial) throw new Error('Testimonial was not saved');
    await recordAudit(tx, {
      organizationId: project.organizationId,
      action: 'testimonial.submitted',
      resourceType: 'testimonial',
      resourceId: testimonial.id,
      clientId: project.clientId,
      metadata: { projectId: data.projectId, consentPublish: data.consentPublish },
    });
    await emit(tx, {
      type: 'testimonials.received',
      organizationId: project.organizationId,
      clientId: project.clientId,
      payload: { projectId: data.projectId, testimonialId: testimonial.id },
    });
  });
  await (deps.flush ?? requestFlush)();
  return { ok: true };
}
