// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { DEFAULT_HUB_DESIGN, type HubSnapshot } from '@agency-os/brand-hub-view';
import type { SiteApi } from './api';
import { HubSite } from './hub-site';

const LOGO = '3f2b8c1e-7d4a-4c6e-9b1a-2e5f8d7c6b4a';

const SNAPSHOT: HubSnapshot = {
  design: DEFAULT_HUB_DESIGN,
  pages: [
    {
      id: 'page-strategy',
      number: '01',
      title: 'Estratégia',
      standardKey: 'strategy',
      blocks: [
        {
          id: 'b-1',
          type: 'strategy',
          content: {
            story: '',
            mission: 'Dar forma a marcas honestas.',
            vision: '',
            values: '',
            voice: '',
            positioning: '',
          },
        },
      ],
    },
    {
      id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
      number: '02',
      title: 'Logótipo',
      standardKey: 'logo',
      blocks: [
        { id: 'b-2', type: 'logo', content: { assetId: LOGO, variant: '', background: 'light' } },
      ],
    },
  ],
  assets: [{ id: LOGO, name: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 10 }],
};

const HUB = {
  snapshot: SNAPSHOT,
  clientName: 'Bloom',
  publishedAt: '2026-10-14T10:00:00.000Z',
  assetUrls: { [LOGO]: 'https://storage.example.com/logo.svg?token=x' },
};

function api(overrides: Partial<SiteApi> = {}): SiteApi {
  return {
    loadHub: vi.fn(async () => ({ status: 200 as const, hub: HUB })),
    unlock: vi.fn(async () => ({ status: 401 as const })),
    zip: vi.fn(async () => ({ status: 404 as const })),
    manual: vi.fn(async () => ({ status: 404 as const })),
    loadHubByDomain: vi.fn(async () => ({ slug: null, result: { status: 404 as const } })),
    accessUrl: (slug: string, returnTo: string) =>
      `https://os.example.com/pt-PT/hub-access/${slug}?return=${encodeURIComponent(returnTo)}`,
    ...overrides,
  };
}

function renderSite(
  siteApi: SiteApi,
  href = 'https://hubs.example.com/bloom/',
  navigate: (url: string) => void = vi.fn(),
) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <HubSite
        api={siteApi}
        siteHost="hubs.example.com"
        location={new URL(href)}
        replaceHash={vi.fn()}
        navigate={navigate}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('the published brand hub site', () => {
  it('the site renders a public hub with its downloads', async () => {
    const siteApi = api();
    renderSite(siteApi);
    expect(await screen.findByText('Dar forma a marcas honestas.')).toBeTruthy();
    expect(siteApi.loadHub).toHaveBeenCalledWith('bloom', null);
    expect(screen.getByRole('img', { name: 'logo.svg' }).getAttribute('src')).toBe(
      'https://storage.example.com/logo.svg?token=x',
    );
    expect(screen.getByRole('button', { name: 'Descarregar Logótipo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descarregar todos os ativos' })).toBeTruthy();
  });

  it('a password unlocks the hub and a wrong one is refused', async () => {
    const loadHub = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, mode: 'password', clientName: 'Bloom' })
      .mockResolvedValue({ status: 200, hub: HUB });
    const unlock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401 })
      .mockResolvedValueOnce({ status: 200, token: 'token-1' });
    renderSite(api({ loadHub, unlock }));

    fireEvent.change(await screen.findByLabelText('Palavra-passe'), {
      target: { value: 'errada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByText('Palavra-passe incorreta.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Palavra-passe'), {
      target: { value: 'marca segura 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByText('Dar forma a marcas honestas.')).toBeTruthy();
    expect(unlock).toHaveBeenLastCalledWith('bloom', 'marca segura 2026');
    expect(loadHub).toHaveBeenLastCalledWith('bloom', 'token-1');
    expect(window.localStorage.getItem('brand-hub-token:bloom')).toBe('token-1');
  });

  it('restricted hubs send visitors to the OS and keep the returned token', async () => {
    const loadHub = vi.fn().mockResolvedValue({
      status: 401,
      mode: 'restricted',
      clientName: 'Bloom',
    });
    renderSite(api({ loadHub }));
    const link = await screen.findByRole('link', { name: 'Entrar com a conta da empresa' });
    expect(link.getAttribute('href')).toBe(
      'https://os.example.com/pt-PT/hub-access/bloom?return=https%3A%2F%2Fhubs.example.com%2Fbloom%2F',
    );
    cleanup();

    const opened = vi.fn().mockResolvedValue({ status: 200, hub: HUB });
    renderSite(api({ loadHub: opened }), 'https://hubs.example.com/bloom/#token=token-2');
    expect(await screen.findByText('Dar forma a marcas honestas.')).toBeTruthy();
    expect(opened).toHaveBeenCalledWith('bloom', 'token-2');
    expect(window.localStorage.getItem('brand-hub-token:bloom')).toBe('token-2');
  });

  it('unknown hubs say so', async () => {
    renderSite(api({ loadHub: vi.fn().mockResolvedValue({ status: 404 }) }));
    expect(await screen.findByText('Brand Hub não encontrado')).toBeTruthy();
    cleanup();
    renderSite(api(), 'https://hubs.example.com/');
    expect(await screen.findByText('Brand Hub não encontrado')).toBeTruthy();
  });

  it('on the site host the slug comes from the path', async () => {
    const siteApi = api();
    renderSite(siteApi, 'https://hubs.example.com/bloom/estrategia');
    expect(await screen.findByText('Dar forma a marcas honestas.')).toBeTruthy();
    expect(siteApi.loadHub).toHaveBeenCalledWith('bloom', null);
    expect(siteApi.loadHubByDomain).not.toHaveBeenCalled();
  });

  it('on a client domain the hub loads by host and unlocks by its slug', async () => {
    const loadHubByDomain = vi
      .fn<SiteApi['loadHubByDomain']>()
      .mockResolvedValueOnce({
        slug: 'bloom',
        result: { status: 401, mode: 'password', clientName: 'Bloom' },
      })
      .mockResolvedValue({ slug: 'bloom', result: { status: 200, hub: HUB } });
    const unlock = vi.fn().mockResolvedValue({ status: 200, token: 'token-3' });
    const siteApi = api({ loadHubByDomain, unlock });
    renderSite(siteApi, 'https://marca.bloom.pt/');

    fireEvent.change(await screen.findByLabelText('Palavra-passe'), {
      target: { value: 'marca segura 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByText('Dar forma a marcas honestas.')).toBeTruthy();
    expect(loadHubByDomain).toHaveBeenNthCalledWith(1, 'marca.bloom.pt', null);
    expect(unlock).toHaveBeenCalledWith('bloom', 'marca segura 2026');
    expect(loadHubByDomain).toHaveBeenLastCalledWith('marca.bloom.pt', 'token-3');
    expect(siteApi.loadHub).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('brand-hub-token:marca.bloom.pt')).toBe('token-3');
  });

  it('a restricted hub on a client domain returns to that domain', async () => {
    const loadHubByDomain = vi.fn().mockResolvedValue({
      slug: 'bloom',
      result: { status: 401, mode: 'restricted', clientName: 'Bloom' },
    });
    renderSite(api({ loadHubByDomain }), 'https://marca.bloom.pt/');
    const link = await screen.findByRole('link', { name: 'Entrar com a conta da empresa' });
    expect(link.getAttribute('href')).toBe(
      'https://os.example.com/pt-PT/hub-access/bloom?return=https%3A%2F%2Fmarca.bloom.pt%2F',
    );
  });

  it('the manual downloads with the token', async () => {
    window.localStorage.setItem('brand-hub-token:bloom', 'token-4');
    const manual = vi.fn().mockResolvedValue({
      status: 200,
      url: 'https://storage.example.com/manual.pdf?token=y',
      fileName: 'bloom-manual-de-marca.pdf',
    });
    const navigate = vi.fn();
    renderSite(api({ manual }), 'https://hubs.example.com/bloom/', navigate);
    fireEvent.click(await screen.findByRole('button', { name: 'Manual completo (PDF)' }));
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('https://storage.example.com/manual.pdf?token=y'),
    );
    expect(manual).toHaveBeenCalledWith('bloom', 'token-4');
  });

  it('a stale token is dropped', async () => {
    window.localStorage.setItem('brand-hub-token:bloom', 'old');
    const loadHub = vi.fn().mockResolvedValue({
      status: 401,
      mode: 'password',
      clientName: 'Bloom',
    });
    renderSite(api({ loadHub }));
    expect(await screen.findByLabelText('Palavra-passe')).toBeTruthy();
    expect(loadHub).toHaveBeenCalledWith('bloom', 'old');
    expect(window.localStorage.getItem('brand-hub-token:bloom')).toBeNull();
  });
});
