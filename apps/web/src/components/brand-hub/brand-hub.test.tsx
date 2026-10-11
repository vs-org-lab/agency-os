// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ApprovalsList } from '@/components/proofing/approvals-list';
import { DEFAULT_HUB_DESIGN, type HubEditorView, type HubSnapshot } from '@/modules/brand-hub';
import { DesignPanel } from './design-panel';
import { HubDownloads } from './hub-downloads';
import { HubEditor, type HubEditorActions } from './hub-editor';
import { HubView } from './hub-view';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

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

const LOGO = '3f2b8c1e-7d4a-4c6e-9b1a-2e5f8d7c6b4a';
const PHOTO = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

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
          id: 'b-strategy',
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
        { id: 'b-text', type: 'text', content: { title: 'Tom', body: 'Primeiro.\n\nSegundo.' } },
      ],
    },
    {
      id: 'page-logo',
      number: '02',
      title: 'Logótipo',
      standardKey: 'logo',
      blocks: [
        {
          id: 'b-logo',
          type: 'logo',
          content: { assetId: LOGO, variant: 'Principal', background: 'dark' },
        },
        {
          id: 'b-image',
          type: 'image',
          content: { assetId: PHOTO, caption: 'Na loja' },
        },
        {
          id: 'b-gallery',
          type: 'gallery',
          content: { items: [{ assetId: PHOTO, caption: 'Montra' }] },
        },
      ],
    },
    {
      id: 'page-color',
      number: '03',
      title: 'Cor',
      standardKey: 'color',
      blocks: [
        {
          id: 'b-colors',
          type: 'colors',
          content: { swatches: [{ name: 'Azul', hex: '#0A2540', notes: 'Pantone 2965 C' }] },
        },
        {
          id: 'b-type',
          type: 'typeface',
          content: {
            family: 'Inter',
            weights: ['400', '700'],
            sample: 'Marcas vivas',
            assetId: null,
          },
        },
        {
          id: 'b-downloads',
          type: 'downloads',
          content: { items: [{ assetId: LOGO, label: 'Logótipo em SVG' }] },
        },
      ],
    },
  ],
  assets: [
    { id: LOGO, name: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 10 },
    { id: PHOTO, name: 'loja.jpg', mimeType: 'image/jpeg', sizeBytes: 20 },
  ],
};

const assetUrl = (assetId: string) => `/api/brand-hub/assets/${assetId}`;

describe('brand hub', () => {
  it('hub view renders every layout and block type', () => {
    for (const layout of ['sidebar', 'topbar', 'split', 'compact'] as const) {
      const { container, unmount } = withIntl(
        <HubView
          snapshot={{ ...SNAPSHOT, design: { ...DEFAULT_HUB_DESIGN, layout } }}
          clientName="Bloom"
          updatedAt="2026-10-12T09:00:00.000Z"
          assetUrl={assetUrl}
        />,
      );
      expect(container.querySelector(`[data-layout="${layout}"]`)).not.toBeNull();
      unmount();
    }
    withIntl(
      <HubView
        snapshot={SNAPSHOT}
        clientName="Bloom"
        updatedAt="2026-10-12T09:00:00.000Z"
        assetUrl={assetUrl}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Secções do Brand Hub' });
    expect(within(nav).getByRole('link', { name: '02 Logótipo' }).getAttribute('href')).toBe(
      '#page-logo',
    );
    expect(screen.getByRole('heading', { level: 2, name: '01 Estratégia' })).toBeTruthy();
    expect(screen.getByText('Dar forma a marcas honestas.')).toBeTruthy();
    expect(screen.queryByText('Visão')).toBeNull();
    expect(screen.getByText('Segundo.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Principal' }).getAttribute('src')).toBe(
      `/api/brand-hub/assets/${LOGO}`,
    );
    expect(screen.getByRole('img', { name: 'Na loja' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Montra' })).toBeTruthy();
    expect(screen.getByText('#0A2540')).toBeTruthy();
    expect(screen.getByText('Marcas vivas')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Logótipo em SVG' }).getAttribute('href')).toBe(
      `/api/brand-hub/assets/${LOGO}`,
    );
    expect(screen.getByText('Brand Hub · Atualizado em 12/10/2026')).toBeTruthy();
  });

  it('hub view renders text as text', () => {
    const hostile: HubSnapshot = {
      ...SNAPSHOT,
      pages: [
        {
          id: 'page-x',
          number: '01',
          title: '<img src=x onerror=alert(1)>',
          standardKey: null,
          blocks: [
            {
              id: 'b-x',
              type: 'text',
              content: { title: 'javascript:alert(1)', body: '<script>alert(1)</script>' },
            },
          ],
        },
      ],
    };
    const { container } = withIntl(
      <HubView
        snapshot={hostile}
        clientName="Bloom"
        updatedAt="2026-10-12T09:00:00.000Z"
        assetUrl={assetUrl}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull();
  });

  it('the editor shows unpublished changes and hides publishing from freelancers', () => {
    const view: Extract<HubEditorView, { hub: object }>['hub'] = {
      id: 'hub-1',
      design: DEFAULT_HUB_DESIGN,
      pages: [
        {
          id: 'page-strategy',
          kind: 'standard',
          standardKey: 'strategy',
          title: 'Estratégia',
          hidden: false,
          blocks: SNAPSHOT.pages[0]?.blocks ?? [],
        },
        {
          id: 'page-extra',
          kind: 'custom',
          standardKey: null,
          title: 'Sinalética',
          hidden: true,
          blocks: [],
        },
      ],
      assets: [
        { id: LOGO, name: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 10, status: 'ready' },
      ],
      unpublishedChanges: true,
      lastPublishedAt: '2026-10-11T09:00:00.000Z',
      approval: 'none',
      canPublish: true,
      contrastWarning: false,
    };
    const actions = new Proxy(
      {},
      { get: () => vi.fn(async () => ({ ok: true })) },
    ) as HubEditorActions;
    const { unmount } = withIntl(
      <HubEditor
        hub={view}
        clientId="client-1"
        clientName="Bloom"
        preview={SNAPSHOT}
        actions={actions}
      />,
    );
    expect(screen.getByText('Alterações por publicar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pedir aprovação' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover Sinalética' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remover Estratégia' })).toBeNull();
    expect(screen.getByLabelText('Missão')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pré-visualizar' }));
    expect(screen.getByRole('navigation', { name: 'Secções do Brand Hub' })).toBeTruthy();
    unmount();

    withIntl(
      <HubEditor
        hub={{ ...view, canPublish: false, unpublishedChanges: false }}
        clientId="client-1"
        clientName="Bloom"
        preview={SNAPSHOT}
        actions={actions}
      />,
    );
    expect(screen.getByText('Tudo publicado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publicar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pedir aprovação' })).toBeNull();
  });

  it('the design panel edits colours by hex and warns on contrast', async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    withIntl(<DesignPanel hubId="hub-1" design={DEFAULT_HUB_DESIGN} save={save} />);
    expect(screen.queryByText(/abaixo do contraste AA/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Texto (hex)'), { target: { value: '#BBBBBB' } });
    expect(screen.getByText(/abaixo do contraste AA/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Dividido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar design' }));
    await screen.findByText('Design guardado.');
    expect(save).toHaveBeenCalledWith('hub-1', {
      ...DEFAULT_HUB_DESIGN,
      colors: { ...DEFAULT_HUB_DESIGN.colors, text: '#BBBBBB' },
      layout: 'split',
    });
  });

  it('downloads offer each page and all assets', () => {
    const requestZip = vi.fn();
    withIntl(<HubDownloads pageId="page-logo" label="Logótipo" requestZip={requestZip} />);
    expect(screen.getByRole('button', { name: 'Descarregar Logótipo' })).toBeTruthy();
    cleanup();
    withIntl(<HubDownloads pageId={null} label="" requestZip={requestZip} />);
    expect(screen.getByRole('button', { name: 'Descarregar todos os ativos' })).toBeTruthy();
  });

  it('approvals list groups the brand hub', () => {
    withIntl(
      <ApprovalsList
        approvals={[
          {
            id: 'approval-1',
            kind: 'brand_hub',
            projectId: 'project-1',
            projectName: 'Website',
            subjectName: 'Brand Hub',
            versionId: null,
            documentId: null,
            requestedAt: '2026-10-10T10:00:00.000Z',
          },
        ]}
        decides
        decide={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Brand Hub' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir o Brand Hub' }).getAttribute('href')).toBe(
      '/portal/hub',
    );
  });
});
