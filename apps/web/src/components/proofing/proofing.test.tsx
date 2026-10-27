// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ProofCommentView } from '@/modules/proofing';
import { ApprovalsList } from './approvals-list';
import { ClientProofList } from './client-proof-list';
import { DecisionPanel } from './decision-panel';
import { ProofViewer } from './proof-viewer';
import { RevisionLimitForm } from './revision-limit-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

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

function renderWithIntl(node: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const OK = async () => ({ ok: true as const });

function comment(overrides: Partial<ProofCommentView>): ProofCommentView {
  return {
    id: crypto.randomUUID(),
    number: 1,
    body: 'Mais contraste',
    anchor: { type: 'point', x: 40, y: 60 },
    internal: false,
    resolved: false,
    byClient: true,
    authorName: 'Marta Lopes',
    createdAt: '2026-10-12T09:00:00.000Z',
    replies: [],
    ...overrides,
  };
}

describe('proofing components', () => {
  it('clicking the image places a numbered pin', async () => {
    const addComment = vi.fn(OK);
    renderWithIntl(
      <ProofViewer
        kind="image"
        src="https://files.example/logo.png"
        title="Logótipo"
        number={2}
        pages={null}
        comments={[
          comment({ number: 1 }),
          comment({ number: 2, anchor: { type: 'point', x: 10, y: 10 } }),
        ]}
        audience="client"
        canComment
        addComment={addComment}
      />,
    );

    const surface = screen.getByRole('img', { name: 'Logótipo, versão 2' })
      .parentElement as HTMLElement;
    surface.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        x: 0,
        y: 0,
      }) as DOMRect;
    fireEvent.click(surface, { clientX: 50, clientY: 25 });

    expect(screen.getByRole('button', { name: 'Comentário 1' })).toBeTruthy();
    expect(screen.getByText('Ponto 3')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Comentário'), { target: { value: 'Mudar a cor' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comentar' }));
    });
    expect(addComment).toHaveBeenCalledWith({
      body: 'Mudar a cor',
      anchor: { type: 'point', x: 25, y: 25 },
      internal: false,
    });
  });

  it('video comments carry the current second', async () => {
    const addComment = vi.fn(OK);
    renderWithIntl(
      <ProofViewer
        kind="video"
        src="https://files.example/spot.mp4"
        title="Spot"
        number={1}
        pages={null}
        comments={[]}
        audience="team"
        canComment
        addComment={addComment}
      />,
    );

    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: 42.4, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Comentar neste momento' }));
    fireEvent.change(screen.getByLabelText('Comentário'), { target: { value: 'Corte aqui' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comentar' }));
    });

    expect(addComment).toHaveBeenCalledWith({
      body: 'Corte aqui',
      anchor: { type: 'time', seconds: 42.4 },
      internal: false,
    });
  });

  it('general comments have no pin', async () => {
    const addComment = vi.fn(OK);
    renderWithIntl(
      <ProofViewer
        kind="image"
        src="https://files.example/logo.png"
        title="Logótipo"
        number={1}
        pages={null}
        comments={[]}
        audience="client"
        canComment
        addComment={addComment}
      />,
    );

    expect(screen.getByText('Geral')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Comentário'), { target: { value: 'Gosto muito' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Comentar' }));
    });

    expect(addComment).toHaveBeenCalledWith({ body: 'Gosto muito', anchor: null, internal: false });
  });

  it('internal toggle only for the team', () => {
    renderWithIntl(
      <ProofViewer
        kind="image"
        src="https://files.example/logo.png"
        title="Logótipo"
        number={1}
        pages={null}
        comments={[]}
        audience="client"
        canComment
        addComment={OK}
      />,
    );
    expect(screen.queryByLabelText('Interno (o cliente não vê)')).toBeNull();

    cleanup();
    renderWithIntl(
      <ProofViewer
        kind="image"
        src="https://files.example/logo.png"
        title="Logótipo"
        number={1}
        pages={null}
        comments={[comment({ internal: true, byClient: false, body: 'Só equipa' })]}
        audience="team"
        canComment
        addComment={OK}
      />,
    );
    expect(screen.getByLabelText('Interno (o cliente não vê)')).toBeTruthy();
    expect(screen.getByText('Interno')).toBeTruthy();
  });

  it('the extra round warning shows before sending', () => {
    renderWithIntl(
      <DecisionPanel
        approvalId="approval-1"
        rounds={{ used: 3, limit: 3, warning: true, extra: false }}
        decide={OK}
      />,
    );
    expect(
      screen.getByText(
        'Este pedido ultrapassa as 3 rondas de revisão previstas e será orçamentado à parte.',
      ),
    ).toBeTruthy();

    cleanup();
    renderWithIntl(
      <DecisionPanel
        approvalId="approval-1"
        rounds={{ used: 1, limit: 3, warning: false, extra: false }}
        decide={OK}
      />,
    );
    expect(screen.queryByText(/será orçamentado à parte/)).toBeNull();
    expect(screen.getByText('1 de 3 rondas de revisão usadas.')).toBeTruthy();
  });

  it('approvals are grouped by type', () => {
    renderWithIntl(
      <ApprovalsList
        approvals={[
          {
            id: 'a-1',
            kind: 'phase',
            projectId: 'p-1',
            projectName: 'Website',
            subjectName: 'Descoberta',
            versionId: null,
            documentId: null,
            requestedAt: '2026-10-10T09:00:00.000Z',
          },
          {
            id: 'a-2',
            kind: 'file',
            projectId: 'p-1',
            projectName: 'Website',
            subjectName: 'Logótipo',
            versionId: 'v-2',
            documentId: null,
            requestedAt: '2026-10-11T09:00:00.000Z',
          },
        ]}
        decides
        decide={OK}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Fases' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ficheiros' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir Logótipo' }).getAttribute('href')).toBe(
      '/portal/proofs/v-2',
    );
  });

  it('approvals group the delivery and let the decision maker decide it', () => {
    renderWithIntl(
      <ApprovalsList
        approvals={[
          {
            id: 'a-3',
            kind: 'delivery',
            projectId: 'p-1',
            projectName: 'Website',
            subjectName: 'Website',
            versionId: null,
            documentId: null,
            requestedAt: '2026-10-12T09:00:00.000Z',
          },
        ]}
        decides
        decide={OK}
      />,
    );

    const group = screen.getByRole('region', { name: 'Entrega final' });
    expect(within(group).getByText('Website', { selector: 'h3' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Aprovar' })).toBeTruthy();
  });

  it('revision limit form saves between 1 and 20', async () => {
    const save = vi.fn(OK);
    renderWithIntl(<RevisionLimitForm projectId="p-1" limit={3} save={save} />);

    fireEvent.change(screen.getByLabelText('Limite de rondas'), { target: { value: '25' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Verifique os campos e tente de novo.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Limite de rondas'), { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(save).toHaveBeenCalledWith('p-1', 5);
  });
});

describe('client proof list', () => {
  it('links every proof sent to the client with the state of its request', () => {
    renderWithIntl(
      <ClientProofList
        proofs={[
          { versionId: 'v-2', title: 'Logótipo', number: 2, status: 'changes_requested' },
          { versionId: 'v-9', title: 'Cartaz', number: 1, status: 'pending' },
        ]}
      />,
    );

    const logo = screen.getByRole('link', { name: /Logótipo/ });
    expect(logo.getAttribute('href')).toBe('/portal/proofs/v-2');
    expect(logo.textContent).toContain(messages.proofing.clientList.status.changes_requested);
    expect(screen.getByRole('link', { name: /Cartaz/ }).textContent).toContain(
      messages.proofing.clientList.status.pending,
    );
  });
});

describe('keyboard pins', () => {
  it('places and moves a pin on an image with the keyboard', () => {
    renderWithIntl(
      <ProofViewer
        kind="image"
        src="https://files.example/logo.png"
        title="Logótipo"
        number={2}
        pages={null}
        comments={[]}
        audience="team"
        canComment
        addComment={OK}
      />,
    );

    const surface = screen.getByRole('application', { name: messages.proofing.viewer.pinSurface });
    surface.focus();
    fireEvent.keyDown(surface, { key: 'Enter' });
    expect(screen.getByRole('img', { name: messages.proofing.viewer.newPin }).style.left).toBe(
      '50%',
    );
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    fireEvent.keyDown(surface, { key: 'ArrowUp', shiftKey: true });
    const pin = screen.getByRole('img', { name: messages.proofing.viewer.newPin });
    expect([pin.style.left, pin.style.top]).toEqual(['52%', '40%']);
  });
});

describe('version comparison', () => {
  const viewer = (props: {
    kind: 'image' | 'pdf';
    previousVersion: { id: string; number: number } | null;
  }) =>
    renderWithIntl(
      <ProofViewer
        kind={props.kind}
        src="/api/proofs/v2/file"
        title="Logótipo"
        number={2}
        pages={props.kind === 'pdf' ? 2 : null}
        previousVersion={props.previousVersion}
        comments={[]}
        audience="client"
        canComment
        addComment={OK}
      />,
    );

  it('compare button only with two image versions', () => {
    viewer({ kind: 'image', previousVersion: null });
    expect(screen.queryByRole('button', { name: 'Comparar com a versão anterior' })).toBeNull();
    cleanup();

    viewer({ kind: 'pdf', previousVersion: { id: 'v1', number: 1 } });
    expect(screen.queryByRole('button', { name: 'Comparar com a versão anterior' })).toBeNull();
    cleanup();

    viewer({ kind: 'image', previousVersion: { id: 'v1', number: 1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar com a versão anterior' }));

    expect(
      screen.getByRole('slider', { name: 'Divisória entre a versão 1 e a versão 2' }),
    ).toBeTruthy();
    expect(screen.getByAltText('Logótipo, versão 1').getAttribute('src')).toBe(
      '/api/proofs/v1/file',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à versão atual' }));
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
