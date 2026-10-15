// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { HubDomainState, HubDomainView } from '@/modules/brand-hub';
import { DomainPanel, type DomainActions } from './domain-panel';
import { HubManualDownload } from './hub-downloads';

afterEach(() => {
  cleanup();
});

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const DOMAIN: HubDomainView = {
  hostname: 'marca.cliente.com',
  status: 'pending',
  verificationName: '_agency-os.marca.cliente.com',
  verificationCode: 'codigo-de-verificacao-1234567890ab',
  cnameTarget: 'cname.vercel-dns.com',
  configured: null,
  challenges: [],
};

const PENDING: HubDomainState = { available: true, approved: true, domain: DOMAIN };

function actions(overrides: Partial<DomainActions> = {}): DomainActions {
  return {
    save: vi.fn(async () => ({ ok: true as const })),
    verify: vi.fn(async () => ({ ok: true as const })),
    connect: vi.fn(async () => ({ ok: true as const })),
    remove: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

const withStatus = (
  status: 'pending' | 'verified' | 'connected',
  configured: boolean | null = null,
): HubDomainState => ({
  available: true,
  approved: true,
  domain: { ...DOMAIN, status, configured },
});

describe('DomainPanel', () => {
  it('the panel shows the records to create while pending', async () => {
    const domainActions = actions();
    withIntl(<DomainPanel hubId="hub-1" approved state={PENDING} actions={domainActions} />);
    expect(screen.getByText('Estado: A aguardar verificação')).toBeTruthy();
    expect(screen.getByText('_agency-os.marca.cliente.com')).toBeTruthy();
    expect(screen.getByText('codigo-de-verificacao-1234567890ab')).toBeTruthy();
    expect(screen.getByText('cname.vercel-dns.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiar valor de TXT' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ligar domínio' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Endereço do domínio'), {
      target: { value: 'brand.cliente.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar domínio' }));
    await screen.findByText('Domínio guardado.');
    expect(domainActions.save).toHaveBeenCalledWith('hub-1', 'brand.cliente.com');
  });

  it('verification errors explain the missing or different record', async () => {
    const verify = vi
      .fn<DomainActions['verify']>()
      .mockResolvedValueOnce({ ok: false, code: 'missing' })
      .mockResolvedValueOnce({ ok: false, code: 'mismatch' });
    withIntl(<DomainPanel hubId="hub-1" approved state={PENDING} actions={actions({ verify })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    await screen.findByText(
      'O registo TXT ainda não foi encontrado. A propagação do DNS pode demorar.',
    );
    // The first check's transition may still hold the button disabled when its message shows.
    const button = screen.getByRole('button', { name: 'Verificar' }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await screen.findByText('O registo TXT existe, mas tem outro código.');
  });

  it('connecting explains the client approval when the hub is not approved', () => {
    withIntl(
      <DomainPanel
        hubId="hub-1"
        approved={false}
        state={withStatus('verified')}
        actions={actions()}
      />,
    );
    expect(
      screen.getByText(
        'A primeira publicação num domínio do cliente exige o Brand Hub aprovado pelo cliente. Peça a aprovação antes de ligar o domínio.',
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Ligar domínio' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('a connected domain shows waiting for DNS until configured', () => {
    const { unmount } = withIntl(
      <DomainPanel
        hubId="hub-1"
        approved
        state={withStatus('connected', false)}
        actions={actions()}
      />,
    );
    expect(screen.getByText('A aguardar DNS: o CNAME ainda não aponta para o site.')).toBeTruthy();
    unmount();
    withIntl(
      <DomainPanel
        hubId="hub-1"
        approved
        state={withStatus('connected', true)}
        actions={actions()}
      />,
    );
    expect(screen.getByText('O site está disponível em https://marca.cliente.com.')).toBeTruthy();
    expect(screen.queryByText('_agency-os.marca.cliente.com')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover domínio' })).toBeTruthy();
  });

  it('a connected domain shows the record vercel still asks for', () => {
    withIntl(
      <DomainPanel
        hubId="hub-1"
        approved
        state={{
          available: true,
          approved: true,
          domain: {
            ...DOMAIN,
            status: 'connected',
            configured: false,
            challenges: [
              { type: 'TXT', name: '_vercel.cliente.com', value: 'vc-domain-verify=abc' },
            ],
          },
        }}
        actions={actions()}
      />,
    );
    expect(screen.getByText('_vercel.cliente.com')).toBeTruthy();
    expect(screen.getByText('vc-domain-verify=abc')).toBeTruthy();
    expect(screen.queryByText(/O site está disponível/)).toBeNull();
  });

  it('unavailable without configuration', () => {
    withIntl(
      <DomainPanel
        hubId="hub-1"
        approved
        state={{ available: false, approved: false, domain: null }}
        actions={actions()}
      />,
    );
    expect(
      screen.getByText('A ligação de domínios não está configurada neste ambiente.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Endereço do domínio')).toBeNull();
  });

  it('the portal offers the manual', async () => {
    const open = vi.fn();
    const requestManual = vi.fn(async () => ({
      ok: true as const,
      url: 'memory://manual.pdf',
      fileName: 'atlas-manual-de-marca.pdf',
    }));
    withIntl(<HubManualDownload requestManual={requestManual} open={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manual completo (PDF)' }));
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith('memory://manual.pdf'));
  });
});
