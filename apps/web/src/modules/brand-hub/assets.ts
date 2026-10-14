import { randomUUID } from 'node:crypto';
import { and, count, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { recordAudit } from '@/modules/audit';
import {
  detectLibraryType,
  isSafeName,
  MAX_LIBRARY_BYTES,
  STALE_UPLOAD_MS,
} from '@/modules/library';
import { fitsStorage } from '@/modules/library/server';
import type { VerifiedClaims } from '@/platform/db';
import {
  changeDraft,
  editableHub,
  INVALID_INPUT,
  LIMIT_REACHED,
  lockHub,
  NOT_FOUND,
  OK,
  type BrandHubDeps,
  type NotFound,
} from './access';
import { expectedAssetType, MAX_HUB_ASSETS } from './domain/asset-types';
import { withoutAsset } from './domain/blocks';
import { stripImageMetadata } from './domain/strip-metadata';
import { hubAssetPath } from './storage';

const { brandHubAssets, brandHubBlocks } = schema;

const STORAGE_FULL = { ok: false, rule: 'storage_full' } as const;
const INVALID_FILE = { ok: false, rule: 'invalid_file' } as const;
const STRIP_BATCH = 20;

/** Reserves an asset and returns a signed link to upload it straight to the bucket. */
export async function requestHubAssetUpload(
  claims: VerifiedClaims,
  input: { hubId: string; name: string; sizeBytes: number },
  deps: BrandHubDeps,
): Promise<
  | { ok: true; assetId: string; uploadUrl: string }
  | NotFound
  | typeof INVALID_INPUT
  | typeof STORAGE_FULL
  | typeof LIMIT_REACHED
> {
  const access = await editableHub(claims, { kind: 'hub', id: input.hubId }, deps);
  if (!access) return NOT_FOUND;
  const name = input.name.trim();
  const validSize =
    Number.isInteger(input.sizeBytes) &&
    input.sizeBytes > 0 &&
    input.sizeBytes <= MAX_LIBRARY_BYTES;
  if (!isSafeName(name) || name.length > 200 || !validSize || !expectedAssetType(name)) {
    return INVALID_INPUT;
  }
  const reserved = await deps.contexts.withSystemContext(async (tx) => {
    const hub = await lockHub(tx, access.hubId);
    if (!hub) return NOT_FOUND;
    const [active] = await tx
      .select({ total: count() })
      .from(brandHubAssets)
      .where(
        and(
          eq(brandHubAssets.hubId, hub.id),
          isNull(brandHubAssets.removedAt),
          sql`${brandHubAssets.uploadStatus} <> 'rejected'`,
        ),
      );
    if ((active?.total ?? 0) >= MAX_HUB_ASSETS) return LIMIT_REACHED;
    if (!(await fitsStorage(tx, hub.organizationId, input.sizeBytes))) return STORAGE_FULL;
    const assetId = randomUUID();
    const storagePath = hubAssetPath({
      organizationId: hub.organizationId,
      clientId: hub.clientId,
      assetId,
    });
    await tx.insert(brandHubAssets).values({
      id: assetId,
      hubId: hub.id,
      organizationId: hub.organizationId,
      clientId: hub.clientId,
      name,
      sizeBytes: input.sizeBytes,
      storagePath,
      createdBy: access.editor.actorId,
    });
    return { ok: true as const, assetId, storagePath };
  });
  if (!reserved.ok) return reserved;
  return {
    ok: true,
    assetId: reserved.assetId,
    uploadUrl: await deps.storage.createUploadUrl(reserved.storagePath),
  };
}

/**
 * Verifies an uploaded asset: its size must match what was declared and its real type the one its
 * extension names. Only the request that settles the asset acts on the stored file.
 */
export async function confirmHubAsset(
  claims: VerifiedClaims,
  input: { assetId: string },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound | typeof INVALID_FILE> {
  const access = await editableHub(claims, { kind: 'asset', id: input.assetId }, deps);
  if (!access) return NOT_FOUND;
  const [asset] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        name: brandHubAssets.name,
        sizeBytes: brandHubAssets.sizeBytes,
        storagePath: brandHubAssets.storagePath,
        uploadStatus: brandHubAssets.uploadStatus,
        organizationId: brandHubAssets.organizationId,
        clientId: brandHubAssets.clientId,
      })
      .from(brandHubAssets)
      .where(eq(brandHubAssets.id, input.assetId)),
  );
  if (!asset || asset.uploadStatus !== 'uploading') return NOT_FOUND;

  const bytes = await deps.storage.download(asset.storagePath);
  const detected =
    bytes && bytes.length === asset.sizeBytes ? detectLibraryType(bytes, asset.name) : null;
  const accepted = detected !== null && detected.mimeType === expectedAssetType(asset.name);
  const pending = and(
    eq(brandHubAssets.id, input.assetId),
    eq(brandHubAssets.uploadStatus, 'uploading'),
  );

  if (!accepted || !detected || !bytes) {
    const rejected = await deps.contexts.withSystemContext(async (tx) => {
      const updated = await tx
        .update(brandHubAssets)
        .set({ uploadStatus: 'rejected' })
        .where(pending)
        .returning({ id: brandHubAssets.id });
      if (updated.length === 0) return false;
      await recordAudit(tx, {
        organizationId: asset.organizationId,
        action: 'brand_hub.asset_rejected',
        resourceType: 'brand_hub_asset',
        resourceId: input.assetId,
        clientId: asset.clientId,
      });
      return true;
    });
    if (!rejected) return NOT_FOUND;
    await deps.storage.remove(asset.storagePath);
    return INVALID_FILE;
  }
  const clean = await withoutMetadata(asset.storagePath, bytes, detected.mimeType, deps);
  const now = (deps.now ?? (() => new Date()))();
  const ready = await deps.contexts.withSystemContext((tx) =>
    tx
      .update(brandHubAssets)
      .set({
        uploadStatus: 'ready',
        mimeType: detected.mimeType,
        sizeBytes: clean.length,
        metadataStrippedAt: now,
      })
      .where(pending)
      .returning({ id: brandHubAssets.id }),
  );
  return ready.length > 0 ? OK : NOT_FOUND;
}

/** Rewrites a stored image without its metadata (SEC-33) and returns the bytes now stored. */
async function withoutMetadata(
  storagePath: string,
  bytes: Uint8Array,
  mimeType: string,
  deps: BrandHubDeps,
): Promise<Uint8Array> {
  const clean = stripImageMetadata(bytes, mimeType);
  if (clean !== bytes) await deps.storage.upload(storagePath, clean, mimeType);
  return clean;
}

/**
 * Takes an asset out of the draft and out of every draft block. The stored file stays while the
 * current publication lists it; the sweep deletes it afterwards.
 */
export async function removeHubAsset(
  claims: VerifiedClaims,
  input: { assetId: string },
  deps: BrandHubDeps,
): Promise<typeof OK | NotFound> {
  const access = await editableHub(claims, { kind: 'asset', id: input.assetId }, deps);
  if (!access) return NOT_FOUND;
  const now = (deps.now ?? (() => new Date()))();
  return changeDraft(deps, access.hubId, async (tx, hub) => {
    const removed = await tx
      .update(brandHubAssets)
      .set({ removedAt: now })
      .where(and(eq(brandHubAssets.id, input.assetId), isNull(brandHubAssets.removedAt)))
      .returning({ id: brandHubAssets.id });
    if (removed.length === 0) return NOT_FOUND;
    const blocks = await tx
      .select({ id: brandHubBlocks.id, type: brandHubBlocks.type, content: brandHubBlocks.content })
      .from(brandHubBlocks)
      .where(
        and(
          eq(brandHubBlocks.hubId, hub.id),
          sql`${brandHubBlocks.content}::text like ${`%${input.assetId}%`}`,
        ),
      );
    for (const block of blocks) {
      await tx
        .update(brandHubBlocks)
        .set({ content: withoutAsset(block.type, block.content, input.assetId) })
        .where(eq(brandHubBlocks.id, block.id));
    }
    await recordAudit(tx, {
      organizationId: hub.organizationId,
      action: 'brand_hub.asset_removed',
      resourceType: 'brand_hub_asset',
      resourceId: input.assetId,
      clientId: hub.clientId,
    });
    return OK;
  });
}

/**
 * Closes uploads abandoned for longer than the upload link lasts, and deletes removed assets the
 * current publication of their hub no longer lists.
 */
export async function sweepHubAssets(
  deps: BrandHubDeps,
): Promise<{ closed: number; deleted: number; stripped: number }> {
  const cutoff = new Date((deps.now?.() ?? new Date()).getTime() - STALE_UPLOAD_MS);
  const { stale, unused } = await deps.contexts.withSystemContext(async (tx) => {
    const closed = await tx
      .update(brandHubAssets)
      .set({ uploadStatus: 'rejected' })
      .where(
        and(eq(brandHubAssets.uploadStatus, 'uploading'), lt(brandHubAssets.createdAt, cutoff)),
      )
      .returning({ storagePath: brandHubAssets.storagePath });
    const deleted = await tx
      .delete(brandHubAssets)
      .where(
        and(
          isNotNull(brandHubAssets.removedAt),
          sql`not exists (
            select 1 from public.brand_hubs h
            join public.brand_hub_publications p on p.id = h.published_publication_id
            cross join lateral jsonb_array_elements(p.snapshot -> 'assets') listed
            where h.id = ${brandHubAssets.hubId} and listed ->> 'id' = ${brandHubAssets.id}::text
          )`,
        ),
      )
      .returning({ storagePath: brandHubAssets.storagePath });
    return { stale: closed, unused: deleted };
  });
  await deps.storage.removeMany([...stale, ...unused].map((asset) => asset.storagePath));
  return { closed: stale.length, deleted: unused.length, stripped: await stripPending(deps) };
}

/** Ready assets uploaded before metadata removal existed are cleaned a batch at a time. */
async function stripPending(deps: BrandHubDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const pendingAssets = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({
        id: brandHubAssets.id,
        storagePath: brandHubAssets.storagePath,
        mimeType: brandHubAssets.mimeType,
      })
      .from(brandHubAssets)
      .where(
        and(
          eq(brandHubAssets.uploadStatus, 'ready'),
          isNull(brandHubAssets.removedAt),
          isNull(brandHubAssets.metadataStrippedAt),
        ),
      )
      .limit(STRIP_BATCH),
  );
  let stripped = 0;
  for (const asset of pendingAssets) {
    const bytes = await deps.storage.download(asset.storagePath);
    if (!bytes) continue;
    const clean = await withoutMetadata(asset.storagePath, bytes, asset.mimeType ?? '', deps);
    await deps.contexts.withSystemContext((tx) =>
      tx
        .update(brandHubAssets)
        .set({ sizeBytes: clean.length, metadataStrippedAt: now })
        .where(eq(brandHubAssets.id, asset.id)),
    );
    stripped += 1;
  }
  return stripped;
}
