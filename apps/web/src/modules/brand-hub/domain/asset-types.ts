/** The file types a hub accepts, by extension, with the real type each must detect as (SEC-30). */
const HUB_ASSET_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  woff: 'font/woff',
  otf: 'font/otf',
  ttf: 'font/ttf',
  pdf: 'application/pdf',
  zip: 'application/zip',
};

export const MAX_HUB_ASSETS = 300;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** The real type a file of this name must have, or null when the hub does not accept it. */
export function expectedAssetType(name: string): string | null {
  return HUB_ASSET_TYPES[extensionOf(name)] ?? null;
}

export function isImageType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
