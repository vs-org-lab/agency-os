import type { Locale } from '@agency-os/i18n';

const EXTRA_PREFIX: Record<Locale, string> = { 'pt-PT': 'Pedido extra', en: 'Extra request' };

/** The payment request label of a retainer month, in the contract's language (spec 3B.2 §2.7). */
export function retainerMonthLabel(locale: Locale, tier: string, month: string): string {
  const period = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T12:00:00Z`));
  return `Retainer ${tier} · ${period}`;
}

/** The payment request label of an approved extra request, in the contract's language. */
export function retainerExtraLabel(locale: Locale, description: string): string {
  return `${EXTRA_PREFIX[locale]}: ${description}`;
}
