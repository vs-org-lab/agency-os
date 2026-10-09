import type { Locale } from '@agency-os/i18n';

/** Currencies the card provider collects; kwanzas are paid by transfer or Multicaixa Express. */
export const CARD_CURRENCIES = ['EUR', 'GBP', 'USD'] as const;

export type CardCurrency = (typeof CARD_CURRENCIES)[number];

export function isCardCurrency(currency: string): currency is CardCurrency {
  return (CARD_CURRENCIES as readonly string[]).includes(currency);
}

export type CheckoutInput = {
  requestId: string;
  number: string;
  label: string;
  amountMinor: bigint;
  currency: CardCurrency;
  locale: Locale;
  successUrl: string;
  cancelUrl: string;
};

export type PaymentsProvider = {
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
};

/** A confirmed payment reported by the provider, already verified against its signature. */
export type ProviderEvent = {
  id: string;
  requestId: string | null;
  amountMinor: bigint;
  currency: string;
  reference: string;
};
