const FIGMA_HOSTS = new Set(['figma.com', 'www.figma.com']);
const EMBED_KINDS = new Set(['design', 'proto', 'slides', 'deck', 'board']);
const CANVAS_KINDS = new Set(['design', 'file', 'board']);
const KEPT_PARAMS = ['node-id', 'page-id', 'starting-point-node-id'] as const;

/** Prototype embeds fit each frame to the viewer, like slides, without hotspot flashes. */
const PROTOTYPE_PARAMS = [
  ['scaling', 'contain'],
  ['content-scaling', 'fixed'],
  ['hotspot-hints', '0'],
] as const;

function figmaPath(
  input: string,
): { kind: string; fileKey: string; rest: string[]; url: URL } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !FIGMA_HOSTS.has(url.hostname)) return null;
  const [kind, fileKey, ...rest] = url.pathname.split('/').filter(Boolean);
  if (!kind || !fileKey || !/^[A-Za-z0-9]+$/.test(fileKey)) return null;
  return { kind, fileKey, rest, url };
}

/**
 * Converts a Figma share link into its embed URL (Embed Kit 2.0). Only https links on figma.com
 * are accepted; legacy `/file/` links map to `/design/`. Returns null for anything else.
 */
export function toFigmaEmbedUrl(input: string, host: string): string | null {
  const link = figmaPath(input);
  if (!link) return null;
  const embedKind = link.kind === 'file' ? 'design' : link.kind;
  if (!EMBED_KINDS.has(embedKind)) return null;

  const embed = new URL(
    `https://embed.figma.com/${[embedKind, link.fileKey, ...link.rest].join('/')}`,
  );
  for (const param of KEPT_PARAMS) {
    const value = link.url.searchParams.get(param);
    if (value) embed.searchParams.set(param, value);
  }
  embed.searchParams.set('embed-host', host);
  if (embedKind === 'proto') {
    for (const [name, value] of PROTOTYPE_PARAMS) embed.searchParams.set(name, value);
  }
  return embed.toString();
}

/** Whether a Figma link opens the editable canvas rather than a presentation of its frames. */
export function isFigmaCanvasLink(input: string): boolean {
  const link = figmaPath(input);
  return link !== null && CANVAS_KINDS.has(link.kind);
}

export const FIGMA_EMBED_HOST = 'agency-os';
