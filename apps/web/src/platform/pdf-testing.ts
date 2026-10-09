import { inflateSync } from 'node:zlib';

/** Decodes every stream of the file, compressed or not, and looks for the hex-encoded text. */
export function pdfContainsText(pdf: Uint8Array, text: string): boolean {
  const raw = Buffer.from(pdf);
  const decoded: string[] = [raw.toString('latin1')];
  let cursor = 0;
  for (;;) {
    const start = raw.indexOf('stream', cursor, 'latin1');
    if (start < 0) break;
    const dataStart = raw[start + 6] === 0x0d ? start + 8 : start + 7;
    const end = raw.indexOf('endstream', dataStart, 'latin1');
    if (end < 0) break;
    try {
      decoded.push(inflateSync(raw.subarray(dataStart, end)).toString('latin1'));
    } catch {
      decoded.push(raw.subarray(dataStart, end).toString('latin1'));
    }
    cursor = end + 9;
  }
  const hex = Buffer.from(text, 'latin1').toString('hex').toUpperCase();
  return decoded.some((chunk) => chunk.toUpperCase().includes(hex));
}
