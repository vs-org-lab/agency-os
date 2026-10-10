import { describe, expect, it } from 'vitest';
import { parseAnchor } from './anchors';
import { detectProofType } from './file-type';
import { roundsStatus } from './rounds';

function bytes(...values: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === 'number') out.push(value);
    else for (const char of value) out.push(char.charCodeAt(0));
  }
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
}

describe('detectProofType', () => {
  it('detects each accepted type', () => {
    expect(detectProofType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({
      kind: 'image',
      mimeType: 'image/png',
    });
    expect(detectProofType(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({
      kind: 'image',
      mimeType: 'image/jpeg',
    });
    expect(detectProofType(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toEqual({
      kind: 'image',
      mimeType: 'image/webp',
    });
    expect(detectProofType(bytes('%PDF-1.7'))).toEqual({
      kind: 'pdf',
      mimeType: 'application/pdf',
    });
    expect(detectProofType(bytes(0, 0, 0, 0x20, 'ftypisom'))).toEqual({
      kind: 'video',
      mimeType: 'video/mp4',
    });
    expect(detectProofType(bytes(0x1a, 0x45, 0xdf, 0xa3))).toEqual({
      kind: 'video',
      mimeType: 'video/webm',
    });
  });

  it('rejects a renamed file', () => {
    expect(detectProofType(bytes('<html><body>'))).toBeNull();
    expect(detectProofType(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull();
    expect(detectProofType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe('parseAnchor', () => {
  it('anchors stay inside the file', () => {
    expect(parseAnchor('image', { type: 'point', x: 12.5, y: 80 }, null)).toEqual({
      type: 'point',
      x: 12.5,
      y: 80,
    });
    expect(parseAnchor('image', { type: 'point', x: 101, y: 10 }, null)).toBe('invalid');
    expect(parseAnchor('pdf', { type: 'page_point', page: 2, x: 50, y: 50 }, 3)).toEqual({
      type: 'page_point',
      page: 2,
      x: 50,
      y: 50,
    });
    expect(parseAnchor('pdf', { type: 'page_point', page: 4, x: 50, y: 50 }, 3)).toBe('invalid');
    expect(parseAnchor('video', { type: 'time', seconds: 42.4 }, null)).toEqual({
      type: 'time',
      seconds: 42.4,
    });
    expect(parseAnchor('video', { type: 'time', seconds: -1 }, null)).toBe('invalid');
    expect(parseAnchor('image', { type: 'time', seconds: 3 }, null)).toBe('invalid');
    expect(parseAnchor('pdf', null, 3)).toBeNull();
    expect(parseAnchor('pdf', undefined, 3)).toBeNull();
  });
});

describe('roundsStatus', () => {
  it('warns at eighty percent and flags the extra round', () => {
    expect(roundsStatus(1, 3)).toEqual({ used: 1, limit: 3, warning: false, extra: false });
    expect(roundsStatus(3, 3)).toEqual({ used: 3, limit: 3, warning: true, extra: false });
    expect(roundsStatus(4, 3)).toEqual({ used: 4, limit: 3, warning: true, extra: true });
    expect(roundsStatus(4, 5)).toEqual({ used: 4, limit: 5, warning: true, extra: false });
    expect(roundsStatus(3, 5)).toEqual({ used: 3, limit: 5, warning: false, extra: false });
  });
});
