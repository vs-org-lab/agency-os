import { safeZipSegment, zipEntryNames } from '@/modules/library';
import { pageAssetIds, type HubSnapshot, type HubSnapshotPage } from './snapshot';

function pageEntries(
  snapshot: HubSnapshot,
  page: HubSnapshotPage,
  clientName: string,
  folder: string,
): { assetId: string; path: string }[] {
  const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  return pageAssetIds(page.blocks).flatMap((assetId) => {
    const asset = assets.get(assetId);
    if (!asset) return [];
    const name = [clientName, page.title, asset.name].map(safeZipSegment).join('-');
    return [{ assetId, path: `${folder}${name}` }];
  });
}

/**
 * The archive entries of one published page, or of every page under a numbered folder each, named
 * `<client>-<page>-<file>` with repeats suffixed (RN-82).
 */
export function downloadEntries(
  snapshot: HubSnapshot,
  input: { clientName: string; pageId: string | null },
): { assetId: string; path: string }[] {
  const entries =
    input.pageId === null
      ? snapshot.pages.flatMap((page) =>
          pageEntries(
            snapshot,
            page,
            input.clientName,
            `${safeZipSegment(`${page.number} ${page.title}`)}/`,
          ),
        )
      : snapshot.pages
          .filter((page) => page.id === input.pageId)
          .flatMap((page) => pageEntries(snapshot, page, input.clientName, ''));
  const paths = zipEntryNames(entries.map((entry) => entry.path));
  return entries.map((entry, index) => ({ assetId: entry.assetId, path: paths[index] as string }));
}
