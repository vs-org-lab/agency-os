// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { AcceptInvitationForm } from './accept-invitation-form';

vi.mock('./actions', () => ({ acceptInvitationAction: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function show(tokenHash: string) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <AcceptInvitationForm tokenHash={tokenHash} />
    </NextIntlClientProvider>,
  );
}

describe('accept invitation form', () => {
  it('an invalid invitation points the reader to sign in', () => {
    show('');

    expect(screen.getByText(/O convite expirou ou já foi usado/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ir para o início de sessão' }).getAttribute('href'),
    ).toBe('/sign-in');
  });

  it('a valid invitation offers the accept button and no sign-in link', () => {
    show('token-hash');

    expect(screen.getByRole('button', { name: 'Aceitar convite' })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
