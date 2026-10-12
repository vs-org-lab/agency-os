import { and, desc, eq, sql } from 'drizzle-orm';
import { schema, type DbTransaction } from '@agency-os/db';
import { LIBRARY_LINK_TTL_SECONDS } from '@/modules/library';
import type { VerifiedClaims } from '@/platform/db';
import { hubEditor, uuid, type BrandHubDeps } from './access';
import { contrastWarning } from './domain/contrast';
import { buildSnapshot, type HubSnapshot } from './domain/snapshot';
import { readDraft } from './draft';
import type { HubApprovalState, HubEditorView, PortalHubView } from './views';

const { approvals, brandHubAssets, brandHubPublications, brandHubs, clients } = schema;

type Timestamp = Date | string;

async function hubOf(tx: DbTransaction, clientId: string) {
  const [hub] = await tx
    .select({
      id: brandHubs.id,
      draftRevision: brandHubs.draftRevision,
      publishedPublicationId: brandHubs.publishedPublicationId,
      approvedPublicationId: brandHubs.approvedPublicationId,
    })
    .from(brandHubs)
    .where(eq(brandHubs.clientId, clientId));
  return hub ?? null;
}

async function approvalState(
  tx: DbTransaction,
  publicationId: string | null,
): Promise<HubApprovalState> {
  if (!publicationId) return 'none';
  const [latest] = await tx
    .select({ status: approvals.status })
    .from(approvals)
    .where(
      and(
        eq(approvals.subjectType, 'brand_hub_publication'),
        eq(approvals.subjectId, publicationId),
        sql`${approvals.status} <> 'withdrawn'`,
      ),
    )
    .orderBy(desc(approvals.requestedAt))
    .limit(1);
  return latest?.status === 'withdrawn' || !latest ? 'none' : latest.status;
}

/** C-08: the draft with its pages, blocks and assets, and where it stands against the publication. */
export async function loadHubEditor(
  claims: VerifiedClaims,
  clientId: string,
  deps: BrandHubDeps,
): Promise<HubEditorView | null> {
  const editor = await hubEditor(claims, clientId, deps);
  if (!editor) return null;
  return deps.contexts.withSystemContext(async (tx) => {
    const hub = await hubOf(tx, clientId);
    if (!hub) return { hub: null, canCreate: editor.canPublish };
    const draft = await readDraft(tx, hub.id);
    if (!draft) return { hub: null, canCreate: editor.canPublish };
    const [publication] = hub.publishedPublicationId
      ? await tx
          .select({
            revision: brandHubPublications.revision,
            publishedAt: brandHubPublications.publishedAt,
          })
          .from(brandHubPublications)
          .where(eq(brandHubPublications.id, hub.publishedPublicationId))
      : [];
    return {
      hub: {
        id: hub.id,
        design: draft.design,
        pages: draft.pages.map(({ position: _position, ...page }) => page),
        assets: draft.assets.filter((asset) => asset.status !== 'rejected'),
        unpublishedChanges: publication?.revision !== hub.draftRevision,
        lastPublishedAt: publication ? publication.publishedAt.toISOString() : null,
        approval: await approvalState(tx, hub.publishedPublicationId),
        canPublish: editor.canPublish,
        contrastWarning: contrastWarning(draft.design),
      },
    };
  });
}

/** "Pré-visualizar": the draft rendered as the client would see it once published. */
export async function loadHubPreview(
  claims: VerifiedClaims,
  clientId: string,
  deps: BrandHubDeps,
): Promise<HubSnapshot | null> {
  const editor = await hubEditor(claims, clientId, deps);
  if (!editor) return null;
  return deps.contexts.withSystemContext(async (tx) => {
    const hub = await hubOf(tx, clientId);
    const draft = hub ? await readDraft(tx, hub.id) : null;
    if (!draft) return null;
    return buildSnapshot({
      design: draft.design,
      pages: draft.pages,
      assets: draft.assets.filter((asset) => asset.status === 'ready'),
    });
  });
}

/** P-08: the current publication, read through the portal view (RN-80). */
export async function loadPortalHub(
  claims: VerifiedClaims,
  clientId: string,
  deps: BrandHubDeps,
): Promise<PortalHubView | null> {
  if (claims.user_kind !== 'client' || !uuid.safeParse(clientId).success) return null;
  const read = await deps.contexts.withUserContext(claims, async (tx) => {
    const [row] = await tx.execute<{
      id: string;
      snapshot: HubSnapshot;
      published_at: Timestamp;
      approved: boolean | null;
      can_decide: boolean;
    }>(sql`
      select pub.id, pub.snapshot, pub.published_at, pub.approved,
             app.is_client_member(pub.client_id, array['decision_maker']::app.client_role[])
               as can_decide
      from public.portal_brand_hub_publications pub
      where pub.client_id = ${clientId}::uuid
    `);
    if (!row) return null;
    const [pending] = row.can_decide
      ? await tx.execute<{ id: string }>(sql`
          select a.id from public.portal_approvals a
          where a.subject_type = 'brand_hub_publication' and a.subject_id = ${row.id}::uuid
            and a.status = 'pending'
          limit 1
        `)
      : [];
    return {
      snapshot: row.snapshot,
      publishedAt: new Date(row.published_at).toISOString(),
      approved: row.approved === true,
      pendingApprovalId: pending?.id ?? null,
    };
  });
  if (!read) return null;
  return { ...read, clientName: await clientName(clientId, deps) };
}

/** The client's name, for the hub heading and the download names. */
export async function clientName(clientId: string, deps: BrandHubDeps): Promise<string> {
  const [client] = await deps.contexts.withSystemContext((tx) =>
    tx.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)),
  );
  return client?.name ?? '';
}

/**
 * A link of 15 minutes to an asset (SEC-31): editors reach the hub's ready assets, clients only
 * those the current publication lists.
 */
export async function hubAssetUrl(
  claims: VerifiedClaims,
  assetId: string,
  deps: BrandHubDeps,
): Promise<string | null> {
  if (!uuid.safeParse(assetId).success) return null;
  const readable = await deps.contexts.withUserContext(claims, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      select id from public.brand_hub_assets
      where id = ${assetId}::uuid and upload_status = 'ready'
      union
      select id from public.portal_brand_hub_assets where id = ${assetId}::uuid
    `);
    return rows.length > 0;
  });
  if (!readable) return null;
  const [asset] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ storagePath: brandHubAssets.storagePath, name: brandHubAssets.name })
      .from(brandHubAssets)
      .where(eq(brandHubAssets.id, assetId)),
  );
  if (!asset) return null;
  return deps.storage.signedDownloadUrl(asset.storagePath, LIBRARY_LINK_TTL_SECONDS, asset.name);
}
