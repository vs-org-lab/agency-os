import { eq } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { getActiveTemplate } from './templates/service';

const { coreEngagements, deals } = schema;

/**
 * Creates the Core of a deal when its first call is booked. Idempotent per deal: the
 * booking automation may run more than once and proposal sessions reuse the same Core.
 */
export async function ensureEngagement(
  tx: DbTransaction,
  input: { dealId: string },
): Promise<{ engagementId: string; created: boolean }> {
  const [existing] = await tx
    .select({ id: coreEngagements.id })
    .from(coreEngagements)
    .where(eq(coreEngagements.dealId, input.dealId));
  if (existing) return { engagementId: existing.id, created: false };

  const [deal] = await tx
    .select({ organizationId: deals.organizationId, clientId: deals.clientId })
    .from(deals)
    .where(eq(deals.id, input.dealId));
  if (!deal) throw new Error(`Deal ${input.dealId} was not found`);

  const briefing = await getActiveTemplate(tx, deal.organizationId, 'briefing');
  const grid = await getActiveTemplate(tx, deal.organizationId, 'orbit_grid');
  const [created] = await tx
    .insert(coreEngagements)
    .values({
      organizationId: deal.organizationId,
      clientId: deal.clientId,
      dealId: input.dealId,
      briefingTemplateId: briefing.id,
      gridTemplateId: grid.id,
    })
    .onConflictDoNothing({ target: coreEngagements.dealId })
    .returning({ id: coreEngagements.id });

  if (!created) {
    const [raced] = await tx
      .select({ id: coreEngagements.id })
      .from(coreEngagements)
      .where(eq(coreEngagements.dealId, input.dealId));
    if (!raced) throw new Error(`Core of deal ${input.dealId} was not created`);
    return { engagementId: raced.id, created: false };
  }

  await recordAudit(tx, {
    organizationId: deal.organizationId,
    action: 'core.created',
    resourceType: 'core_engagement',
    resourceId: created.id,
    clientId: deal.clientId,
    metadata: { dealId: input.dealId },
  });
  return { engagementId: created.id, created: true };
}

export async function ensureEngagementForCall(
  tx: DbTransaction,
  callId: string,
): Promise<{ engagementId: string; created: boolean } | null> {
  const [call] = await tx
    .select({ dealId: schema.calls.dealId })
    .from(schema.calls)
    .where(eq(schema.calls.id, callId));
  return call ? ensureEngagement(tx, { dealId: call.dealId }) : null;
}
