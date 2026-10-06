import { describe, expect, it } from 'vitest';
import { formatMoney } from '../src/format';

describe('formatMoney', () => {
  it('formats euros for pt-PT', () => {
    const formatted = formatMoney(123456n, 'EUR', 'pt-PT');

    expect(formatted).toContain('1234,56');
    expect(formatted).toContain('€');
  });

  it('formats pounds for en', () => {
    expect(formatMoney(123456n, 'GBP', 'en')).toBe('£1,234.56');
  });

  it('formats negative and large amounts without precision loss', () => {
    expect(formatMoney(-5n, 'USD', 'en')).toBe('-$0.05');
    expect(formatMoney(900719925474099312n, 'USD', 'en')).toBe('$9,007,199,254,740,993.12');
  });
});
