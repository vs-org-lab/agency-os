import { eq, inArray } from 'drizzle-orm';
import { schema } from '@agency-os/db';
import { LIBRARY_LINK_TTL_SECONDS } from '@/modules/library';
import type { VerifiedClaims } from '@/platform/db';
import { NOT_FOUND, type BrandHubDeps, type NotFound } from './access';
import {
  buildManualPdf,
  MANUAL_IMAGE_BUDGET_BYTES,
  manualFileName,
  type ManualImage,
} from './domain/manual-pdf';
import type { HubSnapshot } from './domain/snapshot';
import { clientName } from './readers';
import { currentPublication } from './zip';

const { brandHubAssets, brandHubs } = schema;

const EMBEDDABLE = new Set(['image/jpeg', 'image/png']);

export type HubManual = { url: string; fileName: string };

export type ManualPublication = {
  clientId: string;
  publicationId: string;
  snapshot: HubSnapshot;
  publishedAt: Date;
};

/** Where the manual of a publication is kept, beside the hub's files. */
function manualPath(organizationId: string, clientId: string, publicationId: string): string {
  return ['brand-hub', organizationId, clientId, 'manual', `${publicationId}.pdf`].join('/');
}

/** The JPEG and PNG files of the publication that fit the manual's image budget, in page order. */
async function manualImages(
  snapshot: HubSnapshot,
  deps: BrandHubDeps,
): Promise<Map<string, ManualImage>> {
  const candidates = snapshot.assets.filter((asset) => EMBEDDABLE.has(asset.mimeType));
  const images = new Map<string, ManualImage>();
  if (candidates.length === 0) return images;
  const stored = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ id: brandHubAssets.id, storagePath: brandHubAssets.storagePath })
      .from(brandHubAssets)
      .where(
        inArray(
          brandHubAssets.id,
          candidates.map((asset) => asset.id),
        ),
      ),
  );
  const paths = new Map(stored.map((row) => [row.id, row.storagePath]));
  let budget = MANUAL_IMAGE_BUDGET_BYTES;
  for (const asset of candidates) {
    const path = paths.get(asset.id);
    if (!path || asset.sizeBytes > budget) continue;
    const bytes = await deps.storage.download(path);
    if (!bytes) continue;
    budget -= bytes.length;
    images.set(asset.id, { bytes, mimeType: asset.mimeType });
  }
  return images;
}

/**
 * The brand manual of a publication (RF-093): generated the first time someone asks for it, kept in
 * Storage beside the hub's files and handed out as a link of 15 minutes.
 */
export async function hubManual(
  publication: ManualPublication,
  deps: BrandHubDeps,
): Promise<HubManual> {
  const [hub] = await deps.contexts.withSystemContext((tx) =>
    tx
      .select({ organizationId: brandHubs.organizationId })
      .from(brandHubs)
      .where(eq(brandHubs.clientId, publication.clientId)),
  );
  if (!hub) throw new Error('The brand hub of the publication no longer exists');
  const name = await clientName(publication.clientId, deps);
  const fileName = manualFileName(name);
  const path = manualPath(hub.organizationId, publication.clientId, publication.publicationId);
  if (!(await deps.storage.exists(path))) {
    const pdf = await buildManualPdf({
      clientName: name,
      publishedAt: publication.publishedAt,
      snapshot: publication.snapshot,
      images: await manualImages(publication.snapshot, deps),
    });
    await deps.storage.upload(path, pdf, 'application/pdf');
  }
  return {
    url: await deps.storage.signedDownloadUrl(path, LIBRARY_LINK_TTL_SECONDS, fileName),
    fileName,
  };
}

/** The manual in the portal and the editor, under the same rule as the hub's downloads. */
export async function portalHubManual(
  claims: VerifiedClaims,
  clientId: string,
  deps: BrandHubDeps,
): Promise<({ ok: true } & HubManual) | NotFound> {
  const current = await currentPublication(claims, clientId, deps);
  if (!current) return NOT_FOUND;
  const manual = await hubManual(
    {
      clientId,
      publicationId: current.id,
      snapshot: current.snapshot,
      publishedAt: current.publishedAt,
    },
    deps,
  );
  return { ok: true, ...manual };
}
