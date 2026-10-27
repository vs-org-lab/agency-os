// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import type { TaskDetail } from '@/modules/tasks';
import { installRadixDomPolyfills } from '../../../test/radix-dom';
import { TaskPanel, type TaskPanelActions } from './task-panel';

const replace = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/tasks',
  useRouter: () => ({ replace }),
}));

beforeAll(installRadixDomPolyfills);

beforeEach(() => {
  search = '';
  replace.mockClear();
});

afterEach(() => {
  cleanup();
});

const OK = async () => ({ ok: true as const });
const TASK_ID = '0b5e7f10-1c1a-4a8e-9a55-2f6a0b1c2d3e';
const PROJECT_ID = '1c6f8a21-2d2b-4b9f-8b66-3a7b1c2d3e4f';

function detail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: TASK_ID,
    title: 'Entregar logótipo',
    notes: '',
    clientId: 'c1',
    clientName: 'Atlas Lda',
    projectId: PROJECT_ID,
    projectName: 'Website',
    assigneeId: null,
    assigneeName: null,
    dueOn: null,
    status: 'open',
    items: [],
    itemsDone: 0,
    itemsTotal: 0,
    commentCount: 2,
    fileCount: 0,
    phaseName: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    canEdit: true,
    comments: [
      {
        id: 'k1',
        authorId: 'u1',
        authorName: 'Rita Gestora',
        body: 'Primeira versão pronta.',
        createdAt: '2026-10-02T10:00:00.000Z',
        canDelete: true,
      },
      {
        id: 'k2',
        authorId: 'u2',
        authorName: 'Rui Freelancer',
        body: '<b>Rever</b> cores',
        createdAt: '2026-10-02T11:00:00.000Z',
        canDelete: false,
      },
    ],
    files: [],
    links: [],
    ...overrides,
  };
}

function actions(overrides: Partial<TaskPanelActions> = {}): TaskPanelActions {
  return {
    update: OK,
    remove: OK,
    setItem: OK,
    addItem: OK,
    addComment: OK,
    deleteComment: OK,
    addLink: OK,
    removeLink: OK,
    attachFile: OK,
    detachFile: OK,
    uploadFolder: async () => ({ ok: true as const, folderId: 'f1' }),
    startUploads: async () => ({ ok: true as const, uploads: [] }),
    finishUpload: OK,
    ...overrides,
  };
}

function renderPanel(task: TaskDetail | null, overrides: Partial<TaskPanelActions> = {}) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <TaskPanel detail={task} people={[]} attachable={[]} actions={actions(overrides)} />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
}

async function openCollaboration(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: /Comentários e ficheiros/ }));
}

describe('task panel', () => {
  it('opens from task in the url and shows both tabs with the comment count', () => {
    search = `task=${TASK_ID}&status=all`;
    renderPanel(detail());

    expect(screen.getByRole('dialog', { name: 'Entregar logótipo' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Detalhes' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Comentários e ficheiros (2)' })).toBeTruthy();
  });

  it('names the tab panel after the selected tab', async () => {
    const user = userEvent.setup();
    search = `task=${TASK_ID}`;
    renderPanel(detail());

    expect(screen.getByRole('tabpanel', { name: 'Detalhes' })).toBeTruthy();
    await openCollaboration(user);
    expect(screen.getByRole('tabpanel', { name: /Comentários e ficheiros/ })).toBeTruthy();
  });

  it('closing removes only the task param from the address', async () => {
    const user = userEvent.setup();
    search = `task=${TASK_ID}&status=all`;
    renderPanel(detail());

    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(replace).toHaveBeenCalledWith('/tasks?status=all', { scroll: false });
  });

  it('unknown or unreadable task leaves the list without a panel', () => {
    search = `task=${TASK_ID}`;
    renderPanel(null);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ctrl enter sends one comment and disables while sending', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const addComment = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          finish = () => resolve({ ok: true });
        }),
    );
    renderPanel(detail(), { addComment });
    await openCollaboration(user);

    const field = screen.getByRole('textbox', { name: 'Escrever um comentário…' });
    await user.type(field, 'Aprovado');
    await user.keyboard('{Control>}{Enter}{Enter}{/Control}');

    expect(addComment).toHaveBeenCalledTimes(1);
    expect(addComment).toHaveBeenCalledWith(TASK_ID, 'Aprovado');
    expect((screen.getByRole('button', { name: 'Comentar' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await act(async () => finish());
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe(''));
  });

  it('shows comments as text and offers delete only where allowed', async () => {
    const user = userEvent.setup();
    renderPanel(detail());
    await openCollaboration(user);

    expect(screen.getByText('<b>Rever</b> cores')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar comentário de Rita Gestora' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Apagar comentário de Rui Freelancer' }),
    ).toBeNull();
  });

  it('rejects a javascript link next to the field', async () => {
    const user = userEvent.setup();
    const addLink = vi.fn(OK);
    renderPanel(detail(), { addLink });
    await openCollaboration(user);

    await user.click(screen.getByRole('button', { name: 'Adicionar link' }));
    const field = screen.getByRole('textbox', { name: 'Endereço' });
    await user.type(field, 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    const message = screen.getByText('Use um endereço que comece por https://.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toContain(message.id);
    expect(addLink).not.toHaveBeenCalled();
  });

  it('adds an https link', async () => {
    const user = userEvent.setup();
    const addLink = vi.fn(OK);
    renderPanel(detail(), { addLink });
    await openCollaboration(user);

    await user.click(screen.getByRole('button', { name: 'Adicionar link' }));
    await user.type(screen.getByRole('textbox', { name: 'Endereço' }), 'https://example.com/a');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(addLink).toHaveBeenCalledWith({
      taskId: TASK_ID,
      url: 'https://example.com/a',
      title: null,
    });
  });

  it('delete asks for confirmation', async () => {
    const user = userEvent.setup();
    const remove = vi.fn(OK);
    renderPanel(detail(), { remove });

    await user.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText('Apagar esta tarefa?')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Apagar' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apagar tarefa' }));
    });
    expect(remove).toHaveBeenCalledWith(TASK_ID);
  });

  it('saves the title when leaving the field', async () => {
    const user = userEvent.setup();
    const update = vi.fn(OK);
    renderPanel(detail(), { update });

    const field = screen.getByRole('textbox', { name: 'Título' });
    await user.clear(field);
    await user.type(field, 'Novo título');
    await user.tab();

    expect(update).toHaveBeenCalledWith({ taskId: TASK_ID, title: 'Novo título' });
  });

  it('files block explains why when the task has no project', async () => {
    const user = userEvent.setup();
    renderPanel(detail({ projectId: null, projectName: null }));
    await openCollaboration(user);

    expect(screen.getByText('Os ficheiros vivem na biblioteca de um projeto.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Adicionar ficheiro' })).toBeNull();
  });
});
