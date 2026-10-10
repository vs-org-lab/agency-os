import { z } from 'zod';
import type { ProofKind } from './file-type';

export type ProofAnchor =
  | { type: 'point'; x: number; y: number }
  | { type: 'page_point'; page: number; x: number; y: number }
  | { type: 'time'; seconds: number };

const percent = z.number().finite().min(0).max(100);

const anchorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point'), x: percent, y: percent }),
  z.object({
    type: z.literal('page_point'),
    page: z.number().int().min(1),
    x: percent,
    y: percent,
  }),
  z.object({ type: z.literal('time'), seconds: z.number().finite().min(0) }),
]);

const ANCHOR_FOR_KIND: Record<ProofKind, ProofAnchor['type']> = {
  image: 'point',
  pdf: 'page_point',
  video: 'time',
};

/**
 * Where a comment is pinned: a point on an image, a point on a PDF page, or a second of a video.
 * Null means a general comment; 'invalid' means an anchor outside the file or of the wrong kind.
 */
export function parseAnchor(
  kind: ProofKind,
  input: unknown,
  pages: number | null,
): ProofAnchor | null | 'invalid' {
  if (input === null || input === undefined) return null;
  const parsed = anchorSchema.safeParse(input);
  if (!parsed.success || parsed.data.type !== ANCHOR_FOR_KIND[kind]) return 'invalid';
  if (parsed.data.type === 'page_point' && (pages === null || parsed.data.page > pages)) {
    return 'invalid';
  }
  return parsed.data;
}
