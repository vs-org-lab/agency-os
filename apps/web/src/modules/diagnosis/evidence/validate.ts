export const MAX_EVIDENCE_BYTES = 10_485_760;

export type EvidenceContentType = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';

const SIGNATURES: ReadonlyArray<{
  type: EvidenceContentType;
  bytes: ReadonlyArray<number | null>;
}> = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  {
    type: 'image/webp',
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

/** Identifies an evidence file by its leading bytes, never by its name or declared type. */
export function detectEvidenceType(bytes: Uint8Array): EvidenceContentType | null {
  const match = SIGNATURES.find(
    (signature) =>
      bytes.length >= signature.bytes.length &&
      signature.bytes.every((expected, index) => expected === null || bytes[index] === expected),
  );
  return match?.type ?? null;
}

export const EVIDENCE_EXTENSIONS: Record<EvidenceContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
