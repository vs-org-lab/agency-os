import { describe, expect, it } from 'vitest';
import { isPdf, MAX_BILLING_PDF_BYTES } from './storage';

const header = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];

describe('isPdf', () => {
  it('recognises a pdf header', () => {
    expect(isPdf(new Uint8Array(header))).toBe(true);
  });

  it('refuses other files and files over the limit', () => {
    expect(isPdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isPdf(new Uint8Array([]))).toBe(false);
    const large = new Uint8Array(MAX_BILLING_PDF_BYTES + 1);
    large.set(header);
    expect(isPdf(large)).toBe(false);
  });
});
