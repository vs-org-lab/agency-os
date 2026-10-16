const BOM = '﻿';
const NEEDS_QUOTES = /[",\r\n]/;

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function field(value: string | number | null): string {
  if (value === null) return '';
  // Text a spreadsheet would run as a formula (client and member names come from outside) is
  // kept as text with a leading apostrophe; plain numbers stay numbers.
  const text =
    typeof value === 'string' && FORMULA_START.test(value) && !PLAIN_NUMBER.test(value)
      ? `'${value}`
      : String(value);
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
