// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { ApprovalsList } from '@/components/proofing/approvals-list';
import type { DocumentVersionView, RoomDocumentsView } from '@/modules/project-documents';
import { DocumentActionsBar } from './document-actions';
import { RoomDocumentCards } from './document-cards';
import { DocumentComments } from './document-comments';
import { DocumentViewer } from './document-viewer';

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

const ROOM: RoomDocumentsView = {
  projects: [{ id: 'project-1', name: 'Website', status: 'active' }],
  projectId: 'project-1',
  documents: [
    {
      id: 'doc-1',
      title: 'Estratégia',
      kind: 'pdf',
      status: 'with_client',
      version: 2,
      updatedAt: '2026-10-10T10:00:00.000Z',
    },
    {
      id: 'doc-2',
      title: 'Briefing',
      kind: 'link',
      status: 'draft',
      version: null,
      updatedAt: '2026-10-10T10:00:00.000Z',
    },
  ],
  presentations: [
    { id: 'core-1', title: 'Apresentação Core', status: 'with_client', dealId: 'deal-1' },
  ],
  commercial: { proposal: 'accepted', contract: 'signed', invoices: 'paid' },
  canWrite: true,
};

const version = (overrides: Partial<DocumentVersionView>): DocumentVersionView => ({
  id: 'version-1',
  number: 1,
  kind: 'pdf',
  url: null,
  fileName: 'estrategia.pdf',
  sizeBytes: 4096,
  pages: 3,
  uploadStatus: 'ready',
  shared: true,
  createdAt: '2026-10-10T10:00:00.000Z',
  ...overrides,
});

describe('room documents', () => {
  it('cards show kind, status and version', () => {
    withIntl(<RoomDocumentCards clientId="client-1" view={ROOM} />);

    const strategy = screen.getByRole('link', { name: /Estratégia/ });
    expect(strategy.getAttribute('href')).toBe('/c/client-1/docs/doc-1');
    expect(strategy.textContent).toContain('PDF');
    expect(strategy.textContent).toContain('Com o cliente');
    expect(strategy.textContent).toContain('Versão 2');
    expect(screen.getByRole('link', { name: /Briefing/ }).textContent).toContain('A carregar');
    expect(screen.getByText('Apresentação Core')).toBeTruthy();
    expect(screen.getByText('Contrato')).toBeTruthy();
    expect(screen.getByText('Assinado')).toBeTruthy();
    expect(screen.getByText('Tudo pago')).toBeTruthy();
  });

  it('the viewer renders each kind', () => {
    withIntl(
      <DocumentViewer
        title="Apresentação"
        version={version({
          kind: 'figma',
          url: 'https://www.figma.com/design/AbC123/Estrategia',
          fileName: null,
        })}
      />,
    );
    expect(screen.getByTitle('Apresentação').getAttribute('src')).toContain('embed.figma.com');
    expect(screen.getByRole('link', { name: 'Abrir no Figma' }).getAttribute('href')).toBe(
      'https://www.figma.com/design/AbC123/Estrategia',
    );
    cleanup();

    withIntl(
      <DocumentViewer
        title="Contrato"
        version={version({ kind: 'file', fileName: 'anexo.zip' })}
      />,
    );
    expect(screen.getByRole('link', { name: 'Descarregar anexo.zip' }).getAttribute('href')).toBe(
      '/api/documents/versions/version-1',
    );
    cleanup();

    withIntl(
      <DocumentViewer
        title="Briefing"
        version={version({ kind: 'link', url: 'https://example.com/briefing', fileName: null })}
      />,
    );
    const external = screen.getByRole('link', { name: /example\.com/ });
    expect(external.getAttribute('href')).toBe('https://example.com/briefing');
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');
    expect(external.getAttribute('target')).toBe('_blank');
  });

  it('actions follow permissions and state', () => {
    const noop = vi.fn(async () => ({ ok: true as const }));
    const handlers = {
      share: noop,
      withdraw: noop,
      requestApproval: noop,
      remove: noop,
      changeLink: noop,
      replaceFile: noop,
    };
    withIntl(
      <DocumentActionsBar
        documentId="doc-1"
        kind="pdf"
        actions={{ share: false, withdraw: true, remove: true, requestApproval: true }}
        canWrite
        handlers={handlers}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Partilhar com o cliente' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retirar para rascunho' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pedir aprovação' })).toBeTruthy();
    expect(screen.getByLabelText('Substituir ficheiro')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mudar link' })).toBeNull();
    cleanup();

    withIntl(
      <DocumentActionsBar
        documentId="doc-1"
        kind="link"
        actions={{ share: true, withdraw: false, remove: true, requestApproval: false }}
        canWrite={false}
        handlers={handlers}
      />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('comments mark internal ones for the team only', () => {
    const comments = [
      {
        id: 'c-1',
        body: 'Falta a página 3',
        internal: false,
        authorName: 'Marta Lopes',
        byClient: true,
        versionNumber: 1,
        createdAt: '2026-10-10T10:00:00.000Z',
      },
      {
        id: 'c-2',
        body: 'Rever com o designer',
        internal: true,
        authorName: 'Ana Costa',
        byClient: false,
        versionNumber: 1,
        createdAt: '2026-10-10T11:00:00.000Z',
      },
    ];
    const add = vi.fn(async () => ({ ok: true as const }));
    withIntl(<DocumentComments comments={comments} audience="staff" add={add} />);
    expect(screen.getByText('Interno')).toBeTruthy();
    expect(screen.getByLabelText(/Comentário interno/)).toBeTruthy();
    cleanup();

    withIntl(<DocumentComments comments={comments.slice(0, 1)} audience="portal" add={add} />);
    expect(screen.queryByLabelText(/Comentário interno/)).toBeNull();
    expect(screen.getByText('Falta a página 3')).toBeTruthy();
  });

  it('approvals list groups documents', () => {
    withIntl(
      <ApprovalsList
        approvals={[
          {
            id: 'approval-1',
            kind: 'document',
            projectId: 'project-1',
            projectName: 'Website',
            subjectName: 'Estratégia',
            versionId: null,
            documentId: 'doc-1',
            requestedAt: '2026-10-10T10:00:00.000Z',
          },
        ]}
        decides
        decide={vi.fn(async () => ({ ok: true as const }))}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Documentos' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir Estratégia' }).getAttribute('href')).toBe(
      '/portal/docs/doc-1',
    );
  });
});
