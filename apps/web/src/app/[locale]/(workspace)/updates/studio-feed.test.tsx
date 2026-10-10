// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { FeedEntry } from '@/modules/studio';
import { StudioFeed } from './studio-feed';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

const CLIENT_ID = '0b5e7f10-1c1a-4a8e-9a55-2f6a0b1c2d3e';
const DEAL_ID = '7d3f2a10-9b8c-4e1d-8f2a-1b2c3d4e5f60';

function entry(overrides: Partial<FeedEntry>): FeedEntry {
  return {
    id: crypto.randomUUID(),
    type: 'billing.payment.received',
    clientId: CLIENT_ID,
    clientName: 'Atlas Lda',
    dealId: DEAL_ID,
    decision: null,
    subjectName: null,
    href: `/pipeline/${DEAL_ID}`,
    occurredAt: new Date('2026-10-11T10:00:00Z'),
    ...overrides,
  };
}

describe('StudioFeed', () => {
  it('renders each type with its link', () => {
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
        <StudioFeed
          entries={[
            entry({ type: 'contracts.proposal.accepted' }),
            entry({ type: 'contracts.contract.client_signed' }),
            entry({ type: 'billing.payment.received' }),
            entry({
              type: 'rooms.approval.decided',
              decision: 'changes_requested',
              href: `/c/${CLIENT_ID}`,
            }),
          ]}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Proposta aceite')).toBeTruthy();
    expect(screen.getByText('Contrato assinado pelo cliente')).toBeTruthy();
    expect(screen.getByText('Pagamento recebido')).toBeTruthy();
    expect(screen.getByText('Alterações pedidas numa aprovação')).toBeTruthy();
    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links).toEqual([
      `/pipeline/${DEAL_ID}`,
      `/pipeline/${DEAL_ID}`,
      `/pipeline/${DEAL_ID}`,
      `/c/${CLIENT_ID}`,
    ]);
  });

  it('the feed names the commented file', () => {
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
        <StudioFeed
          entries={[
            entry({
              type: 'proofing.comment.added',
              subjectName: 'Logótipo',
              href: `/c/${CLIENT_ID}/proofs/version-1`,
            }),
          ]}
        />
      </NextIntlClientProvider>,
    );

    const link = screen.getByRole('link');
    expect(link.textContent).toContain('Comentário em Logótipo');
    expect(link.getAttribute('href')).toBe(`/c/${CLIENT_ID}/proofs/version-1`);
  });

  it('shows the empty state without entries', () => {
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
        <StudioFeed entries={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Sem atualizações nos últimos 30 dias')).toBeTruthy();
  });
});
