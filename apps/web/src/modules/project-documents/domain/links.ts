import { FIGMA_EMBED_HOST, toFigmaEmbedUrl } from '@/modules/documents';

const MAX_LINK_LENGTH = 2000;

/**
 * The link a version keeps: a Figma share link that the official embed accepts, or an external
 * `https` link with a host. Anything else is refused.
 */
export function documentLink(kind: 'figma' | 'link', input: string): string | null {
  const value = input.trim();
  if (value.length === 0 || value.length > MAX_LINK_LENGTH) return null;
  if (kind === 'figma') return toFigmaEmbedUrl(value, FIGMA_EMBED_HOST) ? value : null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'https:' && url.hostname !== '' ? value : null;
}
