import { describe, expect, it } from 'vitest';
import { retainerExtraLabel, retainerMonthLabel } from './labels';

describe('retainer payment request labels', () => {
  it('labels name the month and the extra in each locale', () => {
    expect(retainerMonthLabel('pt-PT', 'Essencial', '2026-10-01')).toBe(
      'Retainer Essencial · outubro de 2026',
    );
    expect(retainerMonthLabel('en', 'Essencial', '2026-10-01')).toBe(
      'Retainer Essencial · October 2026',
    );
    expect(retainerExtraLabel('pt-PT', 'Campanha de Natal')).toBe(
      'Pedido extra: Campanha de Natal',
    );
    expect(retainerExtraLabel('en', 'Campanha de Natal')).toBe('Extra request: Campanha de Natal');
  });
});
