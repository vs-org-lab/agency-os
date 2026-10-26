// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MotionProvider } from '@agency-os/ui/motion';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ReceiptMoment, type ReceiptInvoice } from './receipt-moment';

function matchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  matchMedia(false);
});

afterEach(cleanup);

const PAID: ReceiptInvoice = {
  id: 'request-1',
  number: 'PP-2026-0007',
  amount: '1500.00',
  currency: 'EUR',
  status: 'paid',
  paidAt: new Date('2026-10-26T10:00:00Z'),
};

function receipt(invoice: ReceiptInvoice) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <ReceiptMoment invoice={invoice} />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('ReceiptMoment', () => {
  it('prints once for a paid request', () => {
    const first = receipt(PAID);

    expect(screen.getByText('PP-2026-0007')).toBeTruthy();
    expect(first.container.querySelector('[data-receipt]')?.getAttribute('data-receipt')).toBe(
      'printing',
    );
    expect(window.localStorage.getItem('payment-moment:request-1')).not.toBeNull();
    first.unmount();

    const second = receipt(PAID);
    expect(second.container.querySelector('[data-receipt]')?.getAttribute('data-receipt')).toBe(
      'printed',
    );
  });

  it('reduced motion shows the receipt without animation', () => {
    matchMedia(true);

    const view = receipt(PAID);

    expect(view.container.querySelector('[data-receipt]')?.getAttribute('data-receipt')).toBe(
      'printed',
    );
    expect(screen.getByText('PP-2026-0007')).toBeTruthy();
  });

  it('does not run for unpaid requests', () => {
    const view = receipt({ ...PAID, status: 'sent', paidAt: null });

    expect(view.container.querySelector('[data-receipt]')).toBeNull();
    expect(window.localStorage.getItem('payment-moment:request-1')).toBeNull();
  });

  it('shows the receipt statically when storage is unavailable', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      const view = receipt(PAID);
      expect(view.container.querySelector('[data-receipt]')?.getAttribute('data-receipt')).toBe(
        'printed',
      );
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
