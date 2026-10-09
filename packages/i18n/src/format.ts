import type { Locale } from './locale';

export const currencies = ['EUR', 'GBP', 'USD', 'AOA'] as const;

export type Currency = (typeof currencies)[number];

const MINOR_UNIT_DIGITS = 2;

/** Kwanzas show as "Kz", the symbol used in Angola; the ISO code would appear otherwise. */
const NARROW_SYMBOL_CURRENCIES: ReadonlySet<Currency> = new Set(['AOA']);

export type CurrencyFormatOptions = {
  style: 'currency';
  currency: Currency;
  currencyDisplay: 'narrowSymbol' | 'symbol';
};

export function currencyFormatOptions(currency: Currency): CurrencyFormatOptions {
  return {
    style: 'currency',
    currency,
    currencyDisplay: NARROW_SYMBOL_CURRENCIES.has(currency) ? 'narrowSymbol' : 'symbol',
  };
}

function minorUnitsToDecimalString(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(MINOR_UNIT_DIGITS);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(MINOR_UNIT_DIGITS, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function formatMoney(amountMinor: bigint, currency: Currency, locale: Locale): string {
  const formatter = new Intl.NumberFormat(locale, {
    ...currencyFormatOptions(currency),
    minimumFractionDigits: MINOR_UNIT_DIGITS,
    maximumFractionDigits: MINOR_UNIT_DIGITS,
  });
  return formatter.format(
    minorUnitsToDecimalString(amountMinor) as unknown as Parameters<Intl.NumberFormat['format']>[0],
  );
}

export function formatDate(
  value: Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}
