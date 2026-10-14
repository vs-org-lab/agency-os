/** JPEG segments that carry EXIF and XMP (APP1), IPTC (APP13) and comments (COM); only the EXIF Orientation survives. */
const JPEG_DROPPED = new Set([0xe1, 0xed, 0xfe]);
const JPEG_START_OF_SCAN = 0xda;

/** PNG chunks that carry EXIF and text, including XMP. */
const PNG_DROPPED = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt']);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** WebP chunks that carry EXIF and XMP, and their flags in the extended header. */
const WEBP_DROPPED = new Set(['EXIF', 'XMP ']);
const WEBP_METADATA_FLAGS = 0x08 | 0x04;

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const text = (data: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...data.subarray(start, start + length));

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const ORIENTATION_TAG = 0x0112;

/** The EXIF Orientation of an APP1 payload (1 to 8), or null when it has none or does not parse. */
function exifOrientation(payload: Uint8Array): { value: number; littleEndian: boolean } | null {
  if (!EXIF_HEADER.every((value, index) => payload[index] === value)) return null;
  const tiff = payload.subarray(EXIF_HEADER.length);
  if (tiff.length < 8) return null;
  const order = text(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const littleEndian = order === 'II';
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const ifd = view.getUint32(4, littleEndian);
  if (ifd + 2 > tiff.length) return null;
  const entries = view.getUint16(ifd, littleEndian);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > tiff.length) return null;
    if (view.getUint16(entry, littleEndian) === ORIENTATION_TAG) {
      const value = view.getUint16(entry + 8, littleEndian);
      return value >= 1 && value <= 8 ? { value, littleEndian } : null;
    }
  }
  return null;
}

/** An APP1 segment holding only the Orientation tag, so a rotated photo still shows upright. */
function orientationSegment(orientation: { value: number; littleEndian: boolean }): Uint8Array {
  const segment = new Uint8Array(36);
  const view = new DataView(segment.buffer);
  const le = orientation.littleEndian;
  segment.set([0xff, 0xe1], 0);
  view.setUint16(2, 34);
  segment.set(EXIF_HEADER, 4);
  segment.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 10);
  view.setUint16(12, 0x2a, le);
  view.setUint32(14, 8, le);
  view.setUint16(18, 1, le);
  view.setUint16(20, ORIENTATION_TAG, le);
  view.setUint16(22, 3, le);
  view.setUint32(24, 1, le);
  view.setUint16(28, orientation.value, le);
  view.setUint32(32, 0, le);
  return segment;
}

function stripJpeg(data: Uint8Array): Uint8Array | null {
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [data.subarray(0, 2)];
  let keptOrientation = false;
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) return null;
    let markerAt = offset;
    while (data[markerAt + 1] === 0xff) markerAt += 1;
    const marker = data[markerAt + 1];
    if (marker === undefined) return null;
    if (marker === JPEG_START_OF_SCAN) {
      parts.push(data.subarray(markerAt));
      return concat(parts);
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(data.subarray(markerAt, markerAt + 2));
      offset = markerAt + 2;
      continue;
    }
    const high = data[markerAt + 2];
    const low = data[markerAt + 3];
    if (high === undefined || low === undefined) return null;
    const end = markerAt + 2 + ((high << 8) | low);
    if (end > data.length || end < markerAt + 4) return null;
    if (!JPEG_DROPPED.has(marker)) {
      parts.push(data.subarray(markerAt, end));
    } else if (marker === 0xe1 && !keptOrientation) {
      const orientation = exifOrientation(data.subarray(markerAt + 4, end));
      if (orientation && orientation.value !== 1) {
        parts.push(orientationSegment(orientation));
        keptOrientation = true;
      }
    }
    offset = end;
  }
  return null;
}

function stripPng(data: Uint8Array): Uint8Array | null {
  if (!PNG_SIGNATURE.every((value, index) => data[index] === value)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const parts: Uint8Array[] = [data.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > data.length) return null;
    const type = text(data, offset + 4, 4);
    if (!PNG_DROPPED.has(type)) parts.push(data.subarray(offset, end));
    offset = end;
    if (type === 'IEND') return concat(parts);
  }
  return null;
}

function stripWebp(data: Uint8Array): Uint8Array | null {
  if (data.length < 12 || text(data, 0, 4) !== 'RIFF' || text(data, 8, 4) !== 'WEBP') return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset < data.length) {
    if (offset + 8 > data.length) return null;
    const type = text(data, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (end > data.length) return null;
    if (!WEBP_DROPPED.has(type)) {
      const chunk = data.slice(offset, end);
      if (type === 'VP8X' && chunk.length > 8) chunk[8] = (chunk[8] ?? 0) & ~WEBP_METADATA_FLAGS;
      chunks.push(chunk);
    }
    offset = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(data.subarray(0, 4), 0);
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  header.set(data.subarray(8, 12), 8);
  return concat([header, body]);
}

/**
 * The image without its location, device and author metadata (SEC-33): EXIF, XMP, IPTC and text
 * blocks are removed from JPEG, PNG and WebP. Any other type, or a file whose structure does not
 * parse, comes back as it was.
 */
export function stripImageMetadata(bytes: Uint8Array, mimeType: string): Uint8Array {
  const strip =
    mimeType === 'image/jpeg'
      ? stripJpeg
      : mimeType === 'image/png'
        ? stripPng
        : mimeType === 'image/webp'
          ? stripWebp
          : null;
  return strip?.(bytes) ?? bytes;
}
