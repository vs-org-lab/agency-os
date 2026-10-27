// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { StudioService } from '@/platform/studio-services';
import { IntegrationsScreen } from './integrations-screen';

afterEach(cleanup);

const SERVICES: StudioService[] = [
  { key: 'payments', status: 'test' },
  { key: 'email', status: 'active' },
  { key: 'transcription', status: 'test' },
  { key: 'receipts', status: 'missing' },
  { key: 'domains', status: 'missing' },
  { key: 'events', status: 'active' },
];

function renderScreen(google: Parameters<typeof IntegrationsScreen>[0]['google']) {
  const noop = async () => {};
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <IntegrationsScreen
        google={google}
        provider="google"
        services={SERVICES}
        connectAction={noop}
        disconnectAction={noop}
      />
    </NextIntlClientProvider>,
  );
}

describe('integrations screen', () => {
  it('renders three groups and the connected list', () => {
    renderScreen({ status: 'none' });
    for (const name of ['A sua conta', 'Estúdio', 'Ideias para ligar', 'Ligações ativas']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    expect(screen.getByText('Ainda não há ligações ativas.')).toBeTruthy();
    expect(screen.getAllByText('Modo de teste')).toHaveLength(2);
    expect(screen.getAllByText('Por configurar')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Ligar Google Calendar' })).toBeTruthy();
  });

  it('ideas have no buttons', () => {
    renderScreen({ status: 'none' });
    const ideas = screen.getByRole('region', { name: 'Ideias para ligar' });
    expect(within(ideas).queryAllByRole('button')).toHaveLength(0);
    expect(within(ideas).queryAllByRole('link')).toHaveLength(0);
    expect(within(ideas).getAllByText('Em breve')).toHaveLength(5);
  });

  it('studio services are read only', () => {
    renderScreen({ status: 'none' });
    const studio = screen.getByRole('region', { name: 'Estúdio' });
    expect(within(studio).queryAllByRole('button')).toHaveLength(0);
  });

  it('connected google shows disconnect and lists the connection', () => {
    renderScreen({ status: 'active', email: 'a@b.com', connectedAt: new Date('2026-10-01') });
    const list = screen.getByRole('region', { name: 'Ligações ativas' });
    expect(within(list).getByText(/a@b\.com/)).toBeTruthy();
    expect(within(list).getByRole('button', { name: 'Desligar' })).toBeTruthy();
    const account = screen.getByRole('region', { name: 'A sua conta' });
    expect(within(account).getByRole('button', { name: 'Desligar' })).toBeTruthy();
    expect(screen.queryByText('Ainda não há ligações ativas.')).toBeNull();
  });
});
