import { eq } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import type { DbContexts } from '@/platform/db';

const { clients, testimonials } = schema;

export type TestimonialNotice = {
  organizationId: string;
  params: { companyName: string; authorName: string; body: string; roomUrl: string };
};

/** What the founder alert about a new testimonial says, and the room it links to. */
export async function testimonialNotice(
  testimonialId: string,
  deps: { contexts: Pick<DbContexts, 'withSystemContext'>; appBaseUrl: string },
): Promise<TestimonialNotice | null> {
  const [row] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        organizationId: testimonials.organizationId,
        clientId: testimonials.clientId,
        body: testimonials.body,
        authorName: testimonials.authorName,
        companyName: clients.name,
      })
      .from(testimonials)
      .innerJoin(clients, eq(clients.id, testimonials.clientId))
      .where(eq(testimonials.id, testimonialId)),
  );
  if (!row) return null;
  return {
    organizationId: row.organizationId,
    params: {
      companyName: row.companyName,
      authorName: row.authorName,
      body: row.body,
      roomUrl: new URL(`/c/${row.clientId}`, deps.appBaseUrl).toString(),
    },
  };
}
