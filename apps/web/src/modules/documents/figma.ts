const FIGMA_HOSTS = new Set(['figma.com', 'www.figma.com']);
const EMBED_KINDS = new Set(['design', 'proto', 'slides', 'deck', 'board']);
const KEPT_PARAMS = ['node-id', 'page-id', 'starting-point-node-id'] as const;

/**
 * Converts a Figma share link into its embed URL (Embed Kit 2.0). Only https links on figma.com
 * are accepted; legacy `/file/` links map to `/design/`. Returns null for anything else.
 */
export function toFigmaEmbedUrl(input: string, host: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !FIGMA_HOSTS.has(url.hostname)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const [kind, fileKey, ...rest] = segments;
  if (!kind || !fileKey) return null;
  const embedKind = kind === 'file' ? 'design' : kind;
  if (!EMBED_KINDS.has(embedKind) || !/^[A-Za-z0-9]+$/.test(fileKey)) return null;

  const embed = new URL(`https://embed.figma.com/${[embedKind, fileKey, ...rest].join('/')}`);
  for (const param of KEPT_PARAMS) {
    const value = url.searchParams.get(param);
    if (value) embed.searchParams.set(param, value);
  }
  embed.searchParams.set('embed-host', host);
  return embed.toString();
}

export const FIGMA_EMBED_HOST = 'agency-os';
