import type { Currency } from '@agency-os/i18n';
import { toMinorUnits } from '@/modules/contracts/domain/payments';

export type ReconcilableRequest = {
  id: string;
  amount: string;
  currency: Currency;
  status: 'sent' | 'paid' | 'void';
};

export type ReceivedPayment = { requestId: string | null; amountMinor: bigint; currency: string };

/** A payment reconciles only against an open request with the same amount and currency (RN-33). */
export function reconcileDecision(
  request: ReconcilableRequest,
  payment: ReceivedPayment,
): 'reconciled' | 'review' {
  const matches =
    payment.requestId === request.id &&
    request.status === 'sent' &&
    payment.currency.toUpperCase() === request.currency &&
    payment.amountMinor === toMinorUnits(request.amount);
  return matches ? 'reconciled' : 'review';
}
