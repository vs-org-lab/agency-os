import { describe, expect, it } from 'vitest';
import {
  aggregateMonthly,
  detectDateColumn,
  detectSource,
  monthOf,
  parseCsv,
  parseNumber,
} from './csv';

describe('parseCsv', () => {
  it('reads comma separated rows with quotes and an escaped quote', () => {
    const table = parseCsv(
      'Date,Page,"Sessions"\n2026-10-01,"Home, PT",1200\n2026-10-02,"Sobre ""nós""",980\n',
    );

    expect(table.headers).toEqual(['Date', 'Page', 'Sessions']);
    expect(table.rows).toEqual([
      ['2026-10-01', 'Home, PT', '1200'],
      ['2026-10-02', 'Sobre "nós"', '980'],
    ]);
  });

  it('reads semicolon separated exports and skips preamble comments and blank lines', () => {
    const table = parseCsv('# Relatório GA4\r\n\r\nData;Sessões\r\n01/10/2026;1.234,5\r\n');

    expect(table.headers).toEqual(['Data', 'Sessões']);
    expect(table.rows).toEqual([['01/10/2026', '1.234,5']]);
  });
});

describe('parseNumber', () => {
  it('accepts decimal points, decimal commas, thousands separators, percent and currency', () => {
    expect(parseNumber('1200')).toBe(1200);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('3,8%')).toBe(3.8);
    expect(parseNumber('€ 4 500,00')).toBe(4500);
    expect(parseNumber('-12')).toBe(-12);
  });

  it('returns null for text and empty cells', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('n/a')).toBeNull();
  });
});

describe('monthOf', () => {
  it('reads ISO, day-first and compact dates and month labels', () => {
    expect(monthOf('2026-10-14')).toBe('2026-10-01');
    expect(monthOf('14/10/2026')).toBe('2026-10-01');
    expect(monthOf('20261014')).toBe('2026-10-01');
    expect(monthOf('2026-10')).toBe('2026-10-01');
    expect(monthOf('ontem')).toBeNull();
  });
});

describe('detection', () => {
  it('names the source from the headers', () => {
    expect(detectSource(['Date', 'Sessions', 'Key events'])).toBe('GA4');
    expect(detectSource(['Date', 'Clicks', 'Impressions', 'CTR', 'Position'])).toBe(
      'Search Console',
    );
    expect(detectSource(['Day', 'Amount spent (EUR)', 'Results'])).toBe('Meta Ads');
    expect(detectSource(['Day', 'Cost', 'Conversions', 'Impr.'])).toBe('Google Ads');
    expect(detectSource(['Mês', 'Leads'])).toBe('CSV');
  });

  it('finds the date column by its header', () => {
    expect(detectDateColumn(['Page', 'Date', 'Sessions'])).toBe(1);
    expect(detectDateColumn(['Mês', 'Leads'])).toBe(0);
    expect(detectDateColumn(['Page', 'Sessions'])).toBeNull();
  });
});

describe('aggregateMonthly', () => {
  const rows = [
    ['2026-09-30', '10', '2'],
    ['2026-10-01', '20', '3'],
    ['2026-10-02', '30', '5'],
    ['sem data', '99', '9'],
    ['2026-10-03', '', '4'],
  ];

  it('sums, averages or keeps the last value per month and skips unreadable cells', () => {
    expect(aggregateMonthly(rows, 0, 1, 'sum')).toEqual([
      { month: '2026-09-01', value: 10 },
      { month: '2026-10-01', value: 50 },
    ]);
    expect(aggregateMonthly(rows, 0, 2, 'average')).toEqual([
      { month: '2026-09-01', value: 2 },
      { month: '2026-10-01', value: 4 },
    ]);
    expect(aggregateMonthly(rows, 0, 2, 'last')).toEqual([
      { month: '2026-09-01', value: 2 },
      { month: '2026-10-01', value: 4 },
    ]);
  });
});
