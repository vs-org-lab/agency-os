// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ApprovalDecision, type DecideApproval } from './approval-decision';

afterEach(cleanup);

function show(decide: DecideApproval) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <ApprovalDecision approvalId="approval-1" decide={decide} />
    </NextIntlClientProvider>,
  );
}

describe('approval decision', () => {
  it('moves focus to the confirmation once the decision is recorded', async () => {
    show(vi.fn(async () => ({ ok: true as const })));

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    const confirmation = await screen.findByText('Decisão registada. Obrigado.');
    expect(document.activeElement).toBe(confirmation);
  });

  it('moves focus to the error when the decision fails', async () => {
    show(vi.fn(async () => ({ ok: false as const, code: 'not_found' })));

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    const error = await screen.findByRole('alert');
    expect(document.activeElement).toBe(error);
  });
});
