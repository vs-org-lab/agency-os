import { z } from 'zod';
import type { LibraryQuery } from '@/modules/library';
import type { LibraryParams } from './library-href';

const paramsSchema = z.object({
  project: z.uuid().optional().catch(undefined),
  folder: z.uuid().optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
  kind: z.enum(['folders', 'image', 'video', 'document']).optional().catch(undefined),
  sort: z.enum(['name', 'date', 'size']).optional().catch(undefined),
  view: z.enum(['grid', 'list']).optional().catch(undefined),
});

/** The library state read from the URL; unknown or malformed values fall back to the defaults. */
export function parseLibraryParams(raw: Record<string, string | string[] | undefined>): {
  params: LibraryParams;
  query: LibraryQuery;
} {
  const single = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const params = paramsSchema.parse(single);
  const clean: LibraryParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );
  return {
    params: clean,
    query: {
      ...(clean.project ? { projectId: clean.project } : {}),
      ...(clean.folder ? { folderId: clean.folder } : {}),
      ...(clean.q ? { q: clean.q } : {}),
      ...(clean.kind ? { kind: clean.kind } : {}),
      ...(clean.sort ? { sort: clean.sort } : {}),
    },
  };
}
