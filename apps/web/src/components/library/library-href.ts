import type { LibraryKindFilter, LibrarySort } from '@/modules/library';

export type LibraryViewMode = 'grid' | 'list';

/** The library state carried in the URL (RF-080); grid is the default view. */
export type LibraryParams = {
  project?: string;
  folder?: string;
  q?: string;
  kind?: LibraryKindFilter;
  sort?: LibrarySort;
  view?: LibraryViewMode;
};

const ORDER = ['project', 'folder', 'q', 'kind', 'sort', 'view'] as const;

/** The library address with the given changes; empty values and the default view are left out. */
export function libraryHref(
  basePath: string,
  params: LibraryParams,
  changes: Partial<Record<keyof LibraryParams, string | undefined>> = {},
): string {
  const merged: Partial<Record<keyof LibraryParams, string | undefined>> = {
    ...params,
    ...changes,
  };
  const search = new URLSearchParams();
  for (const key of ORDER) {
    const value = merged[key];
    if (!value || (key === 'view' && value === 'grid')) continue;
    search.set(key, value);
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** A kind filter on images, videos or documents spans the project, so it leaves the folder. */
export function kindHref(
  basePath: string,
  params: LibraryParams,
  kind: LibraryKindFilter | undefined,
): string {
  const spansProject = kind !== undefined && kind !== 'folders';
  return libraryHref(basePath, params, {
    kind,
    q: undefined,
    ...(spansProject ? { folder: undefined } : {}),
  });
}

export function folderHref(basePath: string, params: LibraryParams, folderId?: string): string {
  return libraryHref(basePath, params, { folder: folderId, q: undefined, kind: undefined });
}

export function searchHref(basePath: string, params: LibraryParams, query: string): string {
  return libraryHref(basePath, params, {
    q: query.trim() || undefined,
    folder: undefined,
    kind: undefined,
  });
}
