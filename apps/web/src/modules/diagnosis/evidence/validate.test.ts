import { describe, expect, it } from 'vitest';
import { detectEvidenceType, MAX_EVIDENCE_BYTES } from './validate';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0]);
}

describe('detectEvidenceType', () => {
  it('recognises the allowed types by their signature', () => {
    expect(detectEvidenceType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      'image/png',
    );
    expect(detectEvidenceType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(
      detectEvidenceType(
        bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe('image/webp');
    expect(detectEvidenceType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe('application/pdf');
  });

  it('rejects a file whose content is not an allowed type', () => {
    expect(detectEvidenceType(new TextEncoder().encode('<svg onload="x"></svg>'))).toBeNull();
    expect(detectEvidenceType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull();
    expect(detectEvidenceType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it('caps evidence at 4 MB, below the hosting request limit', () => {
    expect(MAX_EVIDENCE_BYTES).toBe(4_194_304);
  });
});
