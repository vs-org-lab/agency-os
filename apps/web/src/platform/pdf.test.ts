import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { wrapText } from './pdf';

describe('pdf text wrapping', () => {
  it('a word wider than the line is split so no line runs off the page', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const link = `https://drive.example.com/folders/${'a1B2c3D4'.repeat(30)}`;

    const lines = wrapText(font, `Pasta: ${link} fim`, 14, 300);

    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 14)).toBeLessThanOrEqual(300);
    expect(lines.join('').replaceAll(' ', '')).toBe(`Pasta:${link}fim`);
  });
});
