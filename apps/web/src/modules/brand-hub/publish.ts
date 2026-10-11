import { and, eq, max } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import { emit, requestFlush } from '@/modules/events';
import type { VerifiedClaims } from '@/platform/db';
import { editableHub, lockHub, NOT_FOUND, type BrandHubDeps, type NotFound } from './access';
import { buildSnapshot } from './domain/snapshot';
import { readDraft } from './draft';

const { approvals, brandHubPublications, brandHubs } = schema;

const NOTHING_TO_PUBLISH = { ok: false, rule: 'nothing_to_publish' } as const;

/**
 * Freezes the draft into a new publication, the only version the client sees (RN-80), and withdraws
 * a pending approval of the previous one.
 */
export async function publishBrandHub(
  claims: VerifiedClaims,
  input: { hubId: string },
  deps: BrandHubDeps,
): Promise<
  { ok: true; publicationId: string; number: number } | NotFound | typeof NOTHING_TO_PUBLISH
> {
  const access = await editableHub(claims, { kind: 'hub', id: input.hubId }, deps);
  if (!access?.editor.canPublish) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();

  const result = await deps.contexts.withSystemContext(async (tx) => {
    const hub = await lockHub(tx, access.hubId);
    if (!hub) return NOT_FOUND;
    if (hub.draftRevision === hub.publishedRevision) return NOTHING_TO_PUBLISH;
    const draft = await readDraft(tx, hub.id);
    if (!draft) return NOT_FOUND;
    const snapshot = buildSnapshot({
      design: draft.design,
      pages: draft.pages,
      assets: draft.assets.filter((asset) => asset.status === 'ready'),
    });
    const [last] = await tx
      .select({ number: max(brandHubPublications.number) })
      .from(brandHubPublications)
      .where(eq(brandHubPublications.hubId, hub.id));
    const number = (last?.number ?? 0) + 1;
    const [publication] = await tx
      .insert(brandHubPublications)
      .values({
        hubId: hub.id,
        organizationId: hub.organizationId,
        clientId: hub.clientId,
        number,
        revision: hub.draftRevision,
        snapshot,
        publishedBy: access.editor.actorId,
        publishedAt: now,
      })
      .returning({ id: brandHubPublications.id });
    if (!publication) throw new Error('Brand hub publication was not created');
    await tx
      .update(brandHubs)
      .set({ publishedPublicationId: publication.id, updatedAt: now })
      .where(eq(brandHubs.id, hub.id));
    if (hub.publishedPublicationId) {
      await tx
        .update(approvals)
        .set({ status: 'withdrawn', updatedAt: now })
        .where(
          and(
            eq(approvals.subjectType, 'brand_hub_publication'),
            eq(approvals.subjectId, hub.publishedPublicationId),
            eq(approvals.status, 'pending'),
          ),
        );
    }
    await recordAudit(tx, {
      organizationId: hub.organizationId,
      action: 'brand_hub.published',
      resourceType: 'brand_hub_publication',
      resourceId: publication.id,
      clientId: hub.clientId,
      metadata: { number, assets: snapshot.assets.length },
    });
    await emit(tx, {
      type: 'brand_hub.published',
      organizationId: hub.organizationId,
      clientId: hub.clientId,
      payload: { hubId: hub.id, publicationId: publication.id },
    });
    return { ok: true as const, publicationId: publication.id, number };
  });
  if (result.ok) await (deps.flush ?? requestFlush)();
  return result;
}
