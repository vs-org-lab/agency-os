import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { stripImageMetadata } from './strip-metadata';

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));
const bytes = (...parts: (number[] | Uint8Array)[]) =>
  Uint8Array.from(parts.flatMap((part) => Array.from(part)));
const contains = (haystack: Uint8Array, needle: string) =>
  Buffer.from(haystack).includes(Buffer.from(needle, 'latin1'));

function jpegSegment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

function jpeg(): Uint8Array {
  return bytes(
    [0xff, 0xd8],
    jpegSegment(0xe0, ascii('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')),
    jpegSegment(0xe1, ascii('Exif\0\0GPS 38.7223N 9.1393W iPhone')),
    jpegSegment(0xed, ascii('Photoshop 3.0\0IPTC by-line')),
    jpegSegment(0xfe, ascii('camera comment')),
    jpegSegment(
      0xdb,
      Array.from({ length: 65 }, (_, index) => index),
    ),
    [0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6],
    [0x11, 0x22, 0xff, 0x00, 0x33],
    [0xff, 0xd9],
  );
}

function pngChunk(type: string, data: number[]): number[] {
  const typeBytes = Buffer.from(type, 'latin1');
  const body = Buffer.concat([typeBytes, Buffer.from(data)]);
  const length = data.length;
  const crc = crc32(body);
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...body,
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ];
}

function png(): Uint8Array {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    pngChunk('tEXt', ascii('Author\0Ana Lopes')),
    pngChunk('eXIf', ascii('MM\0*GPS 38.7N')),
    pngChunk('iTXt', ascii('XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>')),
    pngChunk('IDAT', [0x78, 0x9c, 0x63, 0x00, 0x00]),
    pngChunk('IEND', []),
  );
}

function riffChunk(type: string, data: number[]): number[] {
  const size = data.length;
  return [
    ...ascii(type),
    size & 0xff,
    (size >> 8) & 0xff,
    (size >> 16) & 0xff,
    (size >> 24) & 0xff,
    ...data,
    ...(size % 2 === 1 ? [0] : []),
  ];
}

function webp(): Uint8Array {
  const body = [
    ...ascii('WEBP'),
    ...riffChunk('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...riffChunk('VP8 ', [1, 2, 3, 4, 5, 6, 7]),
    ...riffChunk('EXIF', ascii('MM\0*GPS 38.7N')),
    ...riffChunk('XMP ', ascii('<x:xmpmeta/>')),
  ];
  const size = body.length;
  return bytes(
    ascii('RIFF'),
    [size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, size >> 24],
    body,
  );
}

function pngChunkTypes(image: Uint8Array): string[] {
  const types: string[] = [];
  for (let offset = 8; offset < image.length;) {
    const length = Buffer.from(image).readUInt32BE(offset);
    types.push(Buffer.from(image.subarray(offset + 4, offset + 8)).toString('latin1'));
    offset += length + 12;
  }
  return types;
}

describe('stripImageMetadata', () => {
  it('metadata is stripped and malformed files pass through', () => {
    const cleanJpeg = stripImageMetadata(jpeg(), 'image/jpeg');
    expect(contains(cleanJpeg, 'GPS')).toBe(false);
    expect(contains(cleanJpeg, 'IPTC')).toBe(false);
    expect(contains(cleanJpeg, 'camera comment')).toBe(false);
    expect(contains(cleanJpeg, 'JFIF')).toBe(true);
    expect(Array.from(cleanJpeg.subarray(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(cleanJpeg.subarray(-7))).toEqual([0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd9]);

    const cleanPng = stripImageMetadata(png(), 'image/png');
    expect(pngChunkTypes(cleanPng)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(contains(cleanPng, 'Ana Lopes')).toBe(false);

    const cleanWebp = stripImageMetadata(webp(), 'image/webp');
    expect(contains(cleanWebp, 'GPS')).toBe(false);
    expect(contains(cleanWebp, 'xmpmeta')).toBe(false);
    const view = Buffer.from(cleanWebp);
    expect(view.readUInt32LE(4)).toBe(cleanWebp.length - 8);
    expect(view[20]! & 0x0c).toBe(0);
    expect(contains(cleanWebp, 'VP8 ')).toBe(true);

    const truncated = jpeg().subarray(0, 30);
    expect(stripImageMetadata(truncated, 'image/jpeg')).toEqual(truncated);
    const noise = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(stripImageMetadata(noise, type)).toEqual(noise);
    }
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(stripImageMetadata(svg, 'image/svg+xml')).toEqual(svg);
  });
});
