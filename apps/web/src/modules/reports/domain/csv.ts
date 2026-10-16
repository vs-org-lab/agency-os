const BOM = '﻿';
const NEEDS_QUOTES = /[",\r\n]/;

function field(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * RF-132: a CSV that spreadsheets open as UTF-8 (byte order mark), comma separated, CRLF line
 * ends, with fields quoted when they hold a comma, a quote or a line break.
 */
export function toCsv(headers: readonly string[], rows: readonly (string | number | null)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(field).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
