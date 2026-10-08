import { eq } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { authorize, loadAccessContext, type Actor } from '@/modules/access';

const { coreEngagements } = schema;

export type EngagementScope = {
  engagementId: string;
  organizationId: string;
  clientId: string;
  dealId: string;
  briefingTemplateId: string;
  gridTemplateId: string;
};

export async function scopedEngagement(
  tx: DbTransaction,
  actor: Actor,
  engagementId: string,
  action: 'read' | 'write',
): Promise<EngagementScope | null> {
  const [engagement] = await tx
    .select({
      engagementId: coreEngagements.id,
      organizationId: coreEngagements.organizationId,
      clientId: coreEngagements.clientId,
      dealId: coreEngagements.dealId,
      briefingTemplateId: coreEngagements.briefingTemplateId,
      gridTemplateId: coreEngagements.gridTemplateId,
    })
    .from(coreEngagements)
    .where(eq(coreEngagements.id, engagementId));
  if (!engagement) return null;
  const ctx = await loadAccessContext(tx, actor);
  const decision = authorize(
    actor,
    action,
    { type: 'pipeline', clientId: engagement.clientId },
    ctx,
  );
  return decision.allowed ? engagement : null;
}
