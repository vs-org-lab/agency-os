export type KpiAggregation = 'sum' | 'average' | 'last';

export type CsvTable = { headers: string[]; rows: string[][] };

export type MonthlyValue = { month: string; value: number };

/** Picks `;` when the header line has more semicolons than commas outside quotes. */
function delimiterOf(line: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

function splitRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/**
 * Reads a CSV export: comment lines (`#`) and blank lines before the header are skipped, the
 * delimiter is `,` or `;`, quoted fields may hold delimiters, quotes and line breaks.
 */
export function parseCsv(text: string): CsvTable {
  const unmarked = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = unmarked.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
  if (start === -1) return { headers: [], rows: [] };
  const body = lines.slice(start).join('\n');
  const records = splitRecords(body, delimiterOf(lines[start] ?? ''))
    .map((record) => record.map((cell) => cell.trim()))
    .filter((record) => record.some((cell) => cell !== ''));
  const [headers = [], ...rows] = records;
  return { headers, rows };
}

const THOUSANDS_WITH_COMMA = /^\d{1,3}(,\d{3})+$/;
const THOUSANDS_WITH_POINT = /^\d{1,3}(\.\d{3})+$/;

/** A number in the formats exports use; null when the cell holds no number. */
export function parseNumber(raw: string): number | null {
  const negative = /^\s*-/.test(raw) || /^\s*\(.*\)\s*$/.test(raw);
  const digits = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return null;
  const lastComma = digits.lastIndexOf(',');
  const lastPoint = digits.lastIndexOf('.');
  let normalised: string;
  if (lastComma !== -1 && lastPoint !== -1) {
    const decimal = lastComma > lastPoint ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalised = digits.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    normalised = THOUSANDS_WITH_COMMA.test(digits)
      ? digits.split(',').join('')
      : digits.replace(',', '.');
  } else if (lastPoint !== -1) {
    normalised = THOUSANDS_WITH_POINT.test(digits) ? digits.split('.').join('') : digits;
  } else {
    normalised = digits;
  }
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

function isoMonth(year: string, month: string): string | null {
  const number = Number(month);
  if (!Number.isInteger(number) || number < 1 || number > 12) return null;
  return `${year}-${String(number).padStart(2, '0')}-01`;
}

/** The first day of the month a date cell belongs to; null when it is not a date. */
export function monthOf(raw: string): string | null {
  const value = raw.trim();
  let match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(value);
  if (match?.[1] && match[2]) return isoMonth(match[1], match[2]);
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match?.[2] && match[3]) return isoMonth(match[3], match[2]);
  match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (match?.[1] && match[2]) return isoMonth(match[1], match[2]);
  match = /^(\d{1,2})\/(\d{4})$/.exec(value);
  if (match?.[1] && match[2]) return isoMonth(match[2], match[1]);
  return null;
}

const SOURCES: Array<{ name: string; signals: RegExp[] }> = [
  { name: 'GA4', signals: [/^sessions$/i, /^key events$/i, /^engaged sessions$/i, /^sessões$/i] },
  { name: 'Search Console', signals: [/^clicks$/i, /^impressions$/i, /^position$/i] },
  { name: 'Meta Ads', signals: [/^amount spent/i, /^results$/i, /^reach$/i] },
  { name: 'Google Ads', signals: [/^cost$/i, /^impr\.?$/i, /^conversions$/i] },
];

/** Names the export by its headers: the source with most matching columns, at least two. */
export function detectSource(headers: readonly string[]): string {
  let best = { name: 'CSV', score: 1 };
  for (const source of SOURCES) {
    const score = headers.filter((header) =>
      source.signals.some((signal) => signal.test(header.trim())),
    ).length;
    if (score > best.score) best = { name: source.name, score };
  }
  return best.name;
}

const DATE_HEADER = /^(date|data|day|dia|month|m[eê]s|week|semana|period|per[ií]odo)\b/i;

/** The index of the date column, or null when no header names one. */
export function detectDateColumn(headers: readonly string[]): number | null {
  const index = headers.findIndex((header) => DATE_HEADER.test(header.trim()));
  return index === -1 ? null : index;
}

/**
 * Totals one numeric column per month: rows without a date or a number are skipped, and the
 * months come back in calendar order.
 */
export function aggregateMonthly(
  rows: readonly string[][],
  dateColumn: number,
  valueColumn: number,
  aggregation: KpiAggregation,
): MonthlyValue[] {
  const byMonth = new Map<string, number[]>();
  for (const row of rows) {
    const month = monthOf(row[dateColumn] ?? '');
    const value = parseNumber(row[valueColumn] ?? '');
    if (month === null || value === null) continue;
    byMonth.set(month, [...(byMonth.get(month) ?? []), value]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => {
      const total = values.reduce((sum, value) => sum + value, 0);
      const value =
        aggregation === 'sum'
          ? total
          : aggregation === 'average'
            ? total / values.length
            : (values[values.length - 1] ?? 0);
      return { month, value: Math.round(value * 10_000) / 10_000 };
    });
}
