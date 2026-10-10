import { describe, expect, it } from 'vitest';
import { detectLibraryType } from './file-type';
import { normaliseUploadPath } from './paths';
import { zipEntryNames } from './zip';

function bytes(...values: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === 'number') out.push(value);
    else for (const char of value) out.push(char.charCodeAt(0));
  }
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
}

const ZIP = [0x50, 0x4b, 0x03, 0x04] as const;
const officePackage = bytes(...ZIP, 0, 0, 0, 0, '[Content_Types].xml', 'word/document.xml');
const plainZip = bytes(...ZIP, 0, 0, 0, 0, 'photos/one.jpg');

describe('detectLibraryType', () => {
  it('every accepted type is detected', () => {
    const cases: Array<[Uint8Array, string, string, string]> = [
      [bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a), 'a.png', 'image', 'image/png'],
      [bytes(0xff, 0xd8, 0xff, 0xe0), 'a.jpg', 'image', 'image/jpeg'],
      [bytes('RIFF', 0, 0, 0, 0, 'WEBP'), 'a.webp', 'image', 'image/webp'],
      [bytes('GIF89a'), 'a.gif', 'image', 'image/gif'],
      [bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'a.svg', 'image', 'image/svg+xml'],
      [bytes(0, 0, 0, 0x18, 'ftypmp42'), 'a.mp4', 'video', 'video/mp4'],
      [bytes(0, 0, 0, 0x14, 'ftypqt  '), 'a.mov', 'video', 'video/quicktime'],
      [bytes(0x1a, 0x45, 0xdf, 0xa3), 'a.webm', 'video', 'video/webm'],
      [bytes('%PDF-1.7'), 'a.pdf', 'document', 'application/pdf'],
      [
        officePackage,
        'a.docx',
        'document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      [
        officePackage,
        'a.xlsx',
        'document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      [
        officePackage,
        'A.PPTX',
        'document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      [plainZip, 'a.zip', 'other', 'application/zip'],
      [bytes('8BPS', 0, 1), 'a.psd', 'other', 'image/vnd.adobe.photoshop'],
      [bytes(0, 1, 0, 0, 0, 0x10), 'a.ttf', 'other', 'font/ttf'],
      [bytes('OTTO'), 'a.otf', 'other', 'font/otf'],
      [bytes('wOFF'), 'a.woff', 'other', 'font/woff'],
      [bytes('wOF2'), 'a.woff2', 'other', 'font/woff2'],
    ];
    for (const [content, name, kind, mimeType] of cases) {
      expect(detectLibraryType(content, name), name).toEqual({ kind, mimeType });
    }
  });

  it('office extensions need an office package', () => {
    expect(detectLibraryType(plainZip, 'proposta.docx')).toBeNull();
    expect(detectLibraryType(officePackage, 'arquivo.zip')).toEqual({
      kind: 'other',
      mimeType: 'application/zip',
    });
    expect(detectLibraryType(plainZip, 'fotos.rar')).toBeNull();
  });

  it('unknown or disguised bytes are refused', () => {
    expect(detectLibraryType(bytes('MZ', 0x90), 'logo.png')).toBeNull();
    expect(detectLibraryType(bytes('<html><script></script>'), 'logo.svg')).toBeNull();
    expect(detectLibraryType(new Uint8Array([0x89, 0x50]), 'a.png')).toBeNull();
    expect(detectLibraryType(bytes('plain text'), 'notes.txt')).toBeNull();
  });

  it('svg is detected after a declaration and comments', () => {
    const svg = bytes(
      0xef,
      0xbb,
      0xbf,
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Illustrator -->\n',
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n  <svg viewBox="0 0 1 1"></svg>',
    );
    expect(detectLibraryType(svg, 'logo.svg')).toEqual({
      kind: 'image',
      mimeType: 'image/svg+xml',
    });
  });
});

describe('normaliseUploadPath', () => {
  it('folder upload paths are normalised and contained', () => {
    expect(normaliseUploadPath('logo.png')).toEqual({ segments: [], fileName: 'logo.png' });
    expect(normaliseUploadPath('Marca/Logos/./logo.png')).toEqual({
      segments: ['Marca', 'Logos'],
      fileName: 'logo.png',
    });
    expect(normaliseUploadPath('\\Marca\\\\Logos\\logo.png')).toEqual({
      segments: ['Marca', 'Logos'],
      fileName: 'logo.png',
    });
    expect(normaliseUploadPath('/Marca/ Logos /logo.png')).toEqual({
      segments: ['Marca', 'Logos'],
      fileName: 'logo.png',
    });
    expect(normaliseUploadPath('Marca/../segredo.png')).toBeNull();
    expect(normaliseUploadPath('Marca/')).toBeNull();
    expect(normaliseUploadPath('')).toBeNull();
    expect(normaliseUploadPath(`${'a'.repeat(121)}/logo.png`)).toBeNull();
    expect(normaliseUploadPath(`${'a'.repeat(201)}.png`)).toBeNull();
  });
});

describe('zipEntryNames', () => {
  it('zip names stay unique', () => {
    expect(
      zipEntryNames([
        'Marca/logo.png',
        'Marca/Logo.png',
        'Marca/logo.png',
        'Marca/LEIA',
        'Marca/leia',
      ]),
    ).toEqual([
      'Marca/logo.png',
      'Marca/Logo (2).png',
      'Marca/logo (3).png',
      'Marca/LEIA',
      'Marca/leia (2)',
    ]);
    expect(zipEntryNames(['a/x.tar.gz', 'a/x.tar.gz'])).toEqual(['a/x.tar.gz', 'a/x.tar (2).gz']);
  });
});
