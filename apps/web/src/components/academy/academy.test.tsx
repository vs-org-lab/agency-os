// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { PortalAcademyView, RoomAcademyView } from '@/modules/academy';
import { PortalAcademy } from './portal-academy';
import { RoomAcademy, type RoomAcademyActions } from './room-academy';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const ok = () => vi.fn().mockResolvedValue({ ok: true });

function actions(overrides: Partial<RoomAcademyActions> = {}): RoomAcademyActions {
  return {
    saveItem: vi.fn().mockResolvedValue({ ok: true, itemId: 'new' }),
    setStatus: ok(),
    deleteItem: ok(),
    moveItem: ok(),
    checkStep: ok(),
    saveSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'new' }),
    deleteSession: ok(),
    ...overrides,
  };
}

const ROOM: RoomAcademyView = {
  canWrite: true,
  items: [
    {
      id: 'i1',
      kind: 'checklist',
      status: 'published',
      title: 'Arranque do CMS',
      description: '',
      url: null,
      file: null,
      steps: [
        {
          id: 's1',
          text: 'Entrar',
          done: true,
          checkedBy: 'Rita Cliente',
          checkedAt: new Date('2026-10-14T10:00:00Z'),
        },
        { id: 's2', text: 'Publicar', done: false, checkedBy: null, checkedAt: null },
      ],
      progress: { done: 1, total: 2 },
    },
    {
      id: 'i2',
      kind: 'manual',
      status: 'draft',
      title: 'Manual da marca',
      description: 'Regras de uso.',
      url: null,
      file: { id: 'f1', name: 'manual.pdf' },
      steps: [],
      progress: { done: 0, total: 0 },
    },
  ],
  sessions: [
    {
      id: 'x1',
      heldOn: '2026-10-14',
      title: 'Formação do CMS',
      durationMinutes: 90,
      summary: 'Publicação de artigos.',
      participants: [{ id: 'p1', userId: 'u1', name: 'Rita Cliente' }],
      materials: [{ id: 'i1', title: 'Arranque do CMS', kind: 'checklist' }],
    },
  ],
  files: [{ id: 'f1', name: 'manual.pdf', folderName: 'Marca' }],
  people: [
    { id: 'u1', name: 'Rita Cliente', side: 'client' },
    { id: 'u2', name: 'Vladimir Silva', side: 'team' },
  ],
};

describe('C-12 academy', () => {
  it('room academy shows state, progress and actions for writers', () => {
    wrap(<RoomAcademy clientId="c1" view={ROOM} actions={actions()} />);

    const checklist = screen.getByRole('article', { name: 'Arranque do CMS' });
    expect(within(checklist).getByText('Publicado')).toBeTruthy();
    expect(within(checklist).getByText('1 de 2 passos')).toBeTruthy();
    expect(within(checklist).getByText('Rita Cliente · 14/10/2026')).toBeTruthy();
    expect(within(checklist).getByRole('button', { name: 'Retirar' })).toBeTruthy();
    const manual = screen.getByRole('article', { name: 'Manual da marca' });
    expect(within(manual).getByText('Rascunho')).toBeTruthy();
    expect(within(manual).getByRole('button', { name: 'Publicar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Novo item' })).toBeTruthy();
    expect(screen.getByText('Formação do CMS')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar sessão' })).toBeTruthy();
  });

  it('room academy without write is read only', () => {
    wrap(<RoomAcademy clientId="c1" view={{ ...ROOM, canWrite: false }} actions={actions()} />);
    expect(screen.queryByRole('button', { name: 'Novo item' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registar sessão' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar sessão' })).toBeNull();
  });

  it('item form switches source by kind', async () => {
    const saveItem = vi.fn().mockResolvedValue({ ok: true, itemId: 'new' });
    wrap(<RoomAcademy clientId="c1" view={ROOM} actions={actions({ saveItem })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Novo item' }));
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'tutorial' } });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Como publicar' } });
    fireEvent.click(screen.getByLabelText('Ligação'));
    fireEvent.change(screen.getByLabelText('Endereço'), {
      target: { value: 'https://youtu.be/abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar item' }));
    await waitFor(() =>
      expect(saveItem).toHaveBeenCalledWith({
        clientId: 'c1',
        kind: 'tutorial',
        title: 'Como publicar',
        description: '',
        source: { url: 'https://youtu.be/abc' },
        steps: [],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Novo item' }));
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'checklist' } });
    expect(screen.queryByLabelText('Endereço')).toBeNull();
    expect(screen.getByLabelText('Passos, um por linha')).toBeTruthy();
  });

  it('session form adds guests and materials', async () => {
    const saveSession = vi.fn().mockResolvedValue({ ok: true, sessionId: 'new' });
    wrap(<RoomAcademy clientId="c1" view={ROOM} actions={actions({ saveSession })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Registar sessão' }));
    const form = screen.getByRole('form', { name: 'Registar sessão' });
    fireEvent.change(within(form).getByLabelText('Data'), { target: { value: '2026-10-15' } });
    fireEvent.change(within(form).getByLabelText('Título'), {
      target: { value: 'Segunda formação' },
    });
    fireEvent.change(within(form).getByLabelText('Duração (minutos)'), { target: { value: '45' } });
    fireEvent.click(within(form).getByLabelText('Rita Cliente'));
    fireEvent.change(within(form).getByLabelText('Convidados, um por linha'), {
      target: { value: 'Ana Costa\n' },
    });
    fireEvent.click(within(form).getByLabelText('Arranque do CMS'));
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar sessão' }));

    await waitFor(() =>
      expect(saveSession).toHaveBeenCalledWith({
        clientId: 'c1',
        heldOn: '2026-10-15',
        title: 'Segunda formação',
        durationMinutes: 45,
        summary: '',
        participantIds: ['u1'],
        guests: ['Ana Costa'],
        materialIds: ['i1'],
      }),
    );
  });
});

const PORTAL: PortalAcademyView = {
  canCheck: true,
  items: [
    {
      id: 't1',
      kind: 'tutorial',
      title: 'Como publicar',
      description: '',
      url: 'https://youtu.be/abc',
      file: null,
      steps: [],
      progress: { done: 0, total: 0 },
    },
    {
      id: 't2',
      kind: 'tutorial',
      title: 'Vídeo da marca',
      description: '',
      url: null,
      file: { id: 'f9', name: '' },
      steps: [],
      progress: { done: 0, total: 0 },
    },
    {
      id: 'i1',
      kind: 'checklist',
      title: 'Arranque do CMS',
      description: '',
      url: null,
      file: null,
      steps: [{ id: 's2', text: 'Publicar', done: false, checkedBy: null, checkedAt: null }],
      progress: { done: 0, total: 1 },
    },
  ],
  sessions: ROOM.sessions,
};

describe('P-09 academy', () => {
  it('portal academy lists published items and checks steps', async () => {
    const check = vi.fn(
      () => new Promise<{ ok: true }>((resolve) => setTimeout(() => resolve({ ok: true }), 50)),
    );
    wrap(<PortalAcademy view={PORTAL} check={check} />);

    const external = screen.getByRole('link', { name: /Como publicar/ });
    expect(external.getAttribute('href')).toBe('https://youtu.be/abc');
    expect(external.getAttribute('target')).toBe('_blank');
    const video = screen.getByLabelText('Vídeo da marca', { selector: 'video' });
    expect(video.tagName).toBe('VIDEO');
    expect(video.getAttribute('src')).toBe('/api/library/files/f9');
    expect(screen.getByText('Formação do CMS')).toBeTruthy();

    const step = screen.getByRole('checkbox', { name: 'Publicar' }) as HTMLInputElement;
    fireEvent.click(step);
    // The step shows as done at once, before the server answers.
    expect(step.checked).toBe(true);
    await waitFor(() => expect(check).toHaveBeenCalledWith({ stepId: 's2', done: true }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('an empty academy says so', () => {
    wrap(<PortalAcademy view={{ canCheck: true, items: [], sessions: [] }} check={ok()} />);
    expect(screen.getByText('A equipa ainda não publicou materiais.')).toBeTruthy();
  });
});
