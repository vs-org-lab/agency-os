import { describe, expect, it } from 'vitest';
import { conversion } from './conversion';
import { toCsv } from './csv';
import { revenueByMonth } from './months';

const zeros = (overrides: Record<number, string>) =>
  Array.from({ length: 12 }, (_, index) => overrides[index] ?? '0.00');

describe('reports domain', () => {
  it('revenue is summed per month and currency in cents', () => {
    expect(
      revenueByMonth(
        [
          { receivedOn: '2026-01-15', amount: '100.50', currency: 'EUR' },
          { receivedOn: '2026-01-20', amount: '49.50', currency: 'EUR' },
          { receivedOn: '2026-03-01', amount: '1000.00', currency: 'USD' },
          { receivedOn: '2026-12-31', amount: '0.10', currency: 'EUR' },
          { receivedOn: '2025-12-31', amount: '5.00', currency: 'EUR' },
        ],
        2026,
      ),
    ).toEqual([
      { currency: 'EUR', months: zeros({ 0: '150.00', 11: '0.10' }), total: '150.10' },
      { currency: 'USD', months: zeros({ 2: '1000.00' }), total: '1000.00' },
    ]);
    expect(revenueByMonth([], 2026)).toEqual([]);
  });

  it('conversion counts entries and later passages', () => {
    const entries = [
      { dealId: 'd1', stage: 'pre_sale' as const, at: '2026-01-10' },
      { dealId: 'd1', stage: 'core' as const, at: '2026-02-01' },
      { dealId: 'd1', stage: 'orbit' as const, at: '2026-03-01' },
      { dealId: 'd2', stage: 'pre_sale' as const, at: '2026-02-10' },
      { dealId: 'd3', stage: 'pre_sale' as const, at: '2025-12-01' },
      { dealId: 'd3', stage: 'core' as const, at: '2026-01-05' },
      { dealId: 'd3', stage: 'core' as const, at: '2026-05-05' },
    ];
    expect(conversion(entries, 2026)).toEqual([
      { from: 'pre_sale', to: 'core', entered: 2, passed: 1, percent: 50 },
      { from: 'core', to: 'orbit', entered: 2, passed: 1, percent: 50 },
      { from: 'orbit', to: 'gravity', entered: 1, passed: 0, percent: 0 },
      { from: 'gravity', to: 'constellation', entered: 0, passed: 0, percent: null },
    ]);
  });

  it('csv neutralises text that a spreadsheet would run as a formula', () => {
    expect(
      toCsv(
        ['Cliente', 'Valor'],
        [
          ['=1+1', '-12.50'],
          ['@SUM(A1)', 3],
          ['+x', null],
          ['-x', -2],
        ],
      ),
    ).toBe("﻿Cliente,Valor\r\n'=1+1,-12.50\r\n'@SUM(A1),3\r\n'+x,\r\n'-x,-2\r\n");
  });

  it('csv quotes fields and starts with a BOM', () => {
    expect(
      toCsv(
        ['Cliente', 'Valor'],
        [
          ['Bloom, Lda', '10.50'],
          ['Diz "olá"', null],
          ['Linha\nnova', 3],
        ],
      ),
    ).toBe('﻿Cliente,Valor\r\n"Bloom, Lda",10.50\r\n"Diz ""olá""",\r\n"Linha\nnova",3\r\n');
  });
});
