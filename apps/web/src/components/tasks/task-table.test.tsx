// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import type { TaskSort, TaskView } from '@/modules/tasks';
import { TaskTable } from './task-table';

function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

const replace = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/tasks',
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  search = '';
  replace.mockClear();
  installMatchMedia();
  window.innerWidth = 1280;
});

afterEach(() => {
  cleanup();
});

const TODAY = '2026-10-12';
const OK = async () => ({ ok: true as const });

function task(overrides: Partial<TaskView>): TaskView {
  return {
    id: crypto.randomUUID(),
    title: 'Tarefa',
    notes: '',
    clientId: 'c1',
    clientName: 'Atlas Lda',
    projectId: null,
    assigneeId: null,
    assigneeName: null,
    dueOn: null,
    status: 'open',
    items: [],
    itemsDone: 0,
    itemsTotal: 0,
    commentCount: 0,
    fileCount: 0,
    phaseName: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    canEdit: true,
    ...overrides,
  };
}

function renderTable(
  tasks: TaskView[],
  props: Partial<{
    sort: TaskSort;
    addItem: (taskId: string, title: string) => Promise<{ ok: true }>;
    showClient: boolean;
  }> = {},
) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <TaskTable
          tasks={tasks}
          today={TODAY}
          showClient={props.showClient ?? true}
          sort={props.sort ?? 'due'}
          setStatus={OK}
          setItem={OK}
          addItem={props.addItem ?? OK}
        />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('task table', () => {
  it('sorts by due date by default and toggles aria-sort', () => {
    renderTable([task({ title: 'A' })]);

    expect(screen.getByRole('columnheader', { name: /Prazo/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: /Criada/ }).hasAttribute('aria-sort')).toBe(
      false,
    );

    fireEvent.click(
      within(screen.getByRole('columnheader', { name: /Criada/ })).getByRole('button'),
    );
    expect(replace).toHaveBeenCalledWith('/tasks?sort=created', { scroll: false });
  });

  it('marks the active sort column, keeping the other params when it changes', () => {
    search = 'status=all&task=abc';
    renderTable([task({ title: 'A' })], { sort: 'created' });

    expect(screen.getByRole('columnheader', { name: /Criada/ }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    fireEvent.click(
      within(screen.getByRole('columnheader', { name: /Tarefa/ })).getByRole('button'),
    );
    expect(replace).toHaveBeenCalledWith('/tasks?status=all&task=abc&sort=title', {
      scroll: false,
    });
  });

  it('expands subtasks and adds one with Enter', async () => {
    const user = userEvent.setup();
    const addItem = vi.fn(async () => ({ ok: true as const }));
    const item = { id: 'i1', position: 1, title: 'Logótipo', done: false };
    const row = task({ title: 'Identidade', items: [item], itemsTotal: 1 });
    renderTable([row], { addItem });

    expect(screen.queryByText('Logótipo')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mostrar subtarefas de Identidade' }));
    expect(await screen.findByText('Logótipo')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Adicionar subtarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da subtarefa' }), 'Tipografia');
    await user.keyboard('{Enter}');

    expect(addItem).toHaveBeenCalledWith(row.id, 'Tipografia');
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Título da subtarefa' }) as HTMLInputElement).value,
      ).toBe(''),
    );
  });

  it('Escape cancels adding a subtask', async () => {
    const user = userEvent.setup();
    const addItem = vi.fn(async () => ({ ok: true as const }));
    renderTable([task({ title: 'Identidade' })], { addItem });

    await user.click(screen.getByRole('button', { name: 'Mostrar subtarefas de Identidade' }));
    await user.click(await screen.findByRole('button', { name: 'Adicionar subtarefa' }));
    await user.type(screen.getByRole('textbox', { name: 'Título da subtarefa' }), 'Rascunho');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Título da subtarefa' })).toBeNull();
    expect(addItem).not.toHaveBeenCalled();
  });

  it('overdue open tasks show the due date in danger', () => {
    renderTable([
      task({ title: 'Atrasada', dueOn: '2026-10-01' }),
      task({ title: 'No prazo', dueOn: '2026-10-20' }),
      task({ title: 'Feita', dueOn: '2026-10-01', status: 'done' }),
    ]);

    const dueClass = (title: string) =>
      screen.getByRole('row', { name: new RegExp(title) }).querySelector('time')?.className;
    expect(dueClass('Atrasada')).toContain('text-danger');
    expect(dueClass('No prazo')).not.toContain('text-danger');
    expect(dueClass('Feita')).not.toContain('text-danger');
  });

  it('shows the phase, assignee, counts and hides the client column in a room', () => {
    renderTable(
      [
        task({
          title: 'Do processo',
          phaseName: 'Discovery',
          assigneeId: 'u1',
          assigneeName: 'Rita Gestora',
          itemsDone: 2,
          itemsTotal: 8,
          commentCount: 3,
        }),
      ],
      { showClient: false },
    );

    const row = screen.getByRole('row', { name: /Do processo/ });
    expect(within(row).getByText('Discovery')).toBeTruthy();
    expect(within(row).getByText('Rita Gestora')).toBeTruthy();
    expect(within(row).getByText('2/8')).toBeTruthy();
    expect(within(row).getByText('3')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Cliente' })).toBeNull();
  });

  it('renders cards below 768px', () => {
    window.innerWidth = 500;
    renderTable([task({ title: 'No telemóvel', dueOn: '2026-10-20' })]);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('list', { name: 'Tarefas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No telemóvel' })).toBeTruthy();
  });

  it('title opens the panel by setting task in the url', async () => {
    search = 'status=all';
    const row = task({ title: 'Abrir' });
    renderTable([row]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    });

    expect(replace).toHaveBeenCalledWith(`/tasks?status=all&task=${row.id}`, { scroll: false });
  });
});
