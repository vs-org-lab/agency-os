import { describe, expect, it } from 'vitest';
import { currencyFormatOptions, formatMoney, type Currency } from '../src/format';

function spaced(value: string): string {
  return value.replace(/\s/g, ' ');
}

describe('formatMoney', () => {
  it('formats euros for pt-PT', () => {
    const formatted = formatMoney(123456n, 'EUR', 'pt-PT');

    expect(formatted).toContain('1234,56');
    expect(formatted).toContain('€');
  });

  it('formats pounds for en', () => {
    expect(formatMoney(123456n, 'GBP', 'en')).toBe('£1,234.56');
  });

  it('formats kwanzas with the Kz symbol in every locale', () => {
    expect(spaced(formatMoney(125000000n, 'AOA', 'pt-PT'))).toBe('1 250 000,00 Kz');
    expect(spaced(formatMoney(125000000n, 'AOA', 'en'))).toBe('Kz 1,250,000.00');
  });

  it('gives the shared formatting options to number formatters', () => {
    const format = (currency: Currency) =>
      spaced(new Intl.NumberFormat('pt-PT', currencyFormatOptions(currency)).format(1250));

    expect(format('AOA')).toBe('1250,00 Kz');
    expect(format('EUR')).toBe('1250,00 €');
  });

  it('formats negative and large amounts without precision loss', () => {
    expect(formatMoney(-5n, 'USD', 'en')).toBe('-$0.05');
    expect(formatMoney(900719925474099312n, 'USD', 'en')).toBe('$9,007,199,254,740,993.12');
  });
});
