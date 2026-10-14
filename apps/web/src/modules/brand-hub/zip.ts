import { inArray, sql } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import {
  LIBRARY_LINK_TTL_SECONDS,
  MAX_ZIP_BYTES,
  MAX_ZIP_FILES,
  safeZipSegment,
  type ZipManifest,
} from '@/modules/library';
import type { VerifiedClaims } from '@/platform/db';
import { hubEditor, NOT_FOUND, uuid, type BrandHubDeps, type NotFound } from './access';
import { downloadEntries } from './domain/downloads';
import type { HubSnapshot } from './domain/snapshot';
import { clientName } from './readers';

const { brandHubAssets } = schema;

export type CurrentPublication = { id: string; snapshot: HubSnapshot; publishedAt: Date };

/** The current publication the caller may download: through the portal view for clients. */
export async function currentPublication(
  claims: VerifiedClaims,
  clientId: string,
  deps: BrandHubDeps,
): Promise<CurrentPublication | null> {
  if (!uuid.safeParse(clientId).success) return null;
  if (claims.user_kind !== 'client' && !(await hubEditor(claims, clientId, deps))) return null;
  const relation =
    claims.user_kind === 'client'
      ? sql`public.portal_brand_hub_publications pub where pub.client_id = ${clientId}::uuid`
      : sql`public.brand_hubs h
            join public.brand_hub_publications pub on pub.id = h.published_publication_id
            where h.client_id = ${clientId}::uuid`;
  const [row] = await deps.contexts.withUserContext(claims, (tx) =>
    tx.execute<{ id: string; snapshot: HubSnapshot; published_at: string | Date }>(
      sql`select pub.id, pub.snapshot, pub.published_at from ${relation}`,
    ),
  );
  return row
    ? { id: row.id, snapshot: row.snapshot, publishedAt: new Date(row.published_at) }
    : null;
}

/**
 * The files of one published page, or of every page, with their standardised paths and links of
 * 15 minutes (RF-093, RN-82, SEC-32). The browser builds the ZIP from it.
 */
export async function hubZipManifest(
  claims: VerifiedClaims,
  input: { clientId: string; pageId: string | null },
  deps: BrandHubDeps,
): Promise<ZipManifest | NotFound | { ok: false; rule: 'zip_too_large' }> {
  if (!uuid.safeParse(input.clientId).success) return NOT_FOUND;
  if (input.pageId !== null && !uuid.safeParse(input.pageId).success) return NOT_FOUND;
  const current = await currentPublication(claims, input.clientId, deps);
  if (!current) return NOT_FOUND;
  return buildHubManifest(current.snapshot, input.clientId, input.pageId, deps);
}

/** The archive of a publication the caller was already allowed to read. */
export async function buildHubManifest(
  snapshot: HubSnapshot,
  clientId: string,
  pageId: string | null,
  deps: BrandHubDeps,
): Promise<ZipManifest | NotFound | { ok: false; rule: 'zip_too_large' }> {
  const page = pageId === null ? null : snapshot.pages.find((p) => p.id === pageId);
  if (pageId !== null && !page) return NOT_FOUND;

  const name = await clientName(clientId, deps);
  const entries = downloadEntries(snapshot, { clientName: name, pageId });
  const sizes = new Map(snapshot.assets.map((asset) => [asset.id, asset.sizeBytes]));
  const totalBytes = entries.reduce((total, entry) => total + (sizes.get(entry.assetId) ?? 0), 0);
  if (entries.length > MAX_ZIP_FILES || totalBytes > MAX_ZIP_BYTES) {
    return { ok: false, rule: 'zip_too_large' };
  }
  const ids = [...new Set(entries.map((entry) => entry.assetId))];
  const stored =
    ids.length === 0
      ? []
      : await deps.contexts.withSystemContext((tx) =>
          tx
            .select({ id: brandHubAssets.id, storagePath: brandHubAssets.storagePath })
            .from(brandHubAssets)
            .where(inArray(brandHubAssets.id, ids)),
        );
  const paths = new Map(stored.map((row) => [row.id, row.storagePath]));
  const manifest: ZipManifest['entries'] = [];
  for (const entry of entries) {
    const storagePath = paths.get(entry.assetId);
    if (!storagePath) continue;
    manifest.push({
      path: entry.path,
      url: await deps.storage.signedUrl(storagePath, LIBRARY_LINK_TTL_SECONDS),
    });
  }
  const label = page ? page.title : 'Brand Hub';
  return {
    ok: true,
    archiveName: `${safeZipSegment(`${name} - ${label}`)}.zip`,
    entries: manifest,
  };
}
