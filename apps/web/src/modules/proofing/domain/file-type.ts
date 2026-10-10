export type ProofKind = 'image' | 'pdf' | 'video';

export type DetectedProofType = { kind: ProofKind; mimeType: string };

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

/** SEC-30: the real type of an uploaded proof, read from its first bytes, never from its name. */
export function detectProofType(bytes: Uint8Array): DetectedProofType | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: 'image', mimeType: 'image/png' };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: 'image', mimeType: 'image/jpeg' };
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) {
    return { kind: 'image', mimeType: 'image/webp' };
  }
  if (startsWith(bytes, ascii('%PDF-'))) return { kind: 'pdf', mimeType: 'application/pdf' };
  if (startsWith(bytes, ascii('ftyp'), 4)) return { kind: 'video', mimeType: 'video/mp4' };
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'video', mimeType: 'video/webm' };
  return null;
}
