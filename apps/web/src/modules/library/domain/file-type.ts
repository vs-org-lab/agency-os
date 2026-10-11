export type LibraryFileKind = 'image' | 'video' | 'document' | 'other';

export type DetectedLibraryType = { kind: LibraryFileKind; mimeType: string };

/** How far into a ZIP the Office manifest entry is looked for. */
const OFFICE_MANIFEST_WINDOW = 65_536;

/** How much of a text file is read to find the opening `<svg` tag. */
const SVG_PROLOGUE_WINDOW = 4_096;

const OFFICE_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

function contains(bytes: Uint8Array, needle: readonly number[], limit: number): boolean {
  const end = Math.min(bytes.length, limit) - needle.length;
  for (let index = 0; index <= end; index += 1) {
    if (startsWith(bytes, needle, index)) return true;
  }
  return false;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** True when the text, past a BOM, whitespace, an XML declaration, comments and a doctype, opens with `<svg`. */
function isSvg(bytes: Uint8Array): boolean {
  let text = new TextDecoder('utf-8', { fatal: false }).decode(
    bytes.subarray(0, SVG_PROLOGUE_WINDOW),
  );
  const prologue = /^\s*(<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/i;
  for (let match = prologue.exec(text); match; match = prologue.exec(text)) {
    text = text.slice(match[0].length);
  }
  return /^\s*<svg[\s>]/i.test(text);
}

function detectZip(bytes: Uint8Array, extension: string): DetectedLibraryType | null {
  const officeType = OFFICE_TYPES[extension];
  if (officeType) {
    return contains(bytes, ascii('[Content_Types].xml'), OFFICE_MANIFEST_WINDOW)
      ? { kind: 'document', mimeType: officeType }
      : null;
  }
  return extension === 'zip' ? { kind: 'other', mimeType: 'application/zip' } : null;
}

/**
 * SEC-30: the real type of an uploaded library file, read from its first bytes. The name only
 * tells apart the formats that share the ZIP signature.
 */
export function detectLibraryType(bytes: Uint8Array, fileName: string): DetectedLibraryType | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'image', mimeType: 'image/png' };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: 'image', mimeType: 'image/jpeg' };
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) {
    return { kind: 'image', mimeType: 'image/webp' };
  }
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) {
    return { kind: 'image', mimeType: 'image/gif' };
  }
  if (startsWith(bytes, ascii('ftypqt'), 4)) {
    return { kind: 'video', mimeType: 'video/quicktime' };
  }
  if (startsWith(bytes, ascii('ftyp'), 4)) return { kind: 'video', mimeType: 'video/mp4' };
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'video', mimeType: 'video/webm' };
  if (startsWith(bytes, ascii('%PDF-'))) return { kind: 'document', mimeType: 'application/pdf' };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return detectZip(bytes, extensionOf(fileName));
  if (startsWith(bytes, ascii('8BPS'))) {
    return { kind: 'other', mimeType: 'image/vnd.adobe.photoshop' };
  }
  if (startsWith(bytes, [0x00, 0x01, 0x00, 0x00])) return { kind: 'other', mimeType: 'font/ttf' };
  if (startsWith(bytes, ascii('OTTO'))) return { kind: 'other', mimeType: 'font/otf' };
  if (startsWith(bytes, ascii('wOFF'))) return { kind: 'other', mimeType: 'font/woff' };
  if (startsWith(bytes, ascii('wOF2'))) return { kind: 'other', mimeType: 'font/woff2' };
  if (isSvg(bytes)) return { kind: 'image', mimeType: 'image/svg+xml' };
  return null;
}
