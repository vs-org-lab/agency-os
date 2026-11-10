// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { TaskStage, TaskView } from '@/modules/tasks';
import { installRadixDomPolyfills } from '../../../test/radix-dom';
import { TaskBoard } from './task-board';

const replace = vi.fn();
const notifyError = vi.fn();

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('client=c1') }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/tasks',
  useRouter: () => ({ replace }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/ui/notify', () => ({
  notify: { error: (message: string) => notifyError(message), success: vi.fn(), info: vi.fn() },
}));

beforeAll(installRadixDomPolyfills);

beforeEach(() => {
  replace.mockClear();
  notifyError.mockClear();
});

afterEach(() => {
  cleanup();
});

const TODAY = '2026-11-09';
const ME = 'u-me';

function task(overrides: Partial<TaskView>): TaskView {
  return {
    id: crypto.randomUUID(),
    title: 'Tarefa',
    notes: '',
    clientId: 'c1',
    clientName: 'Bloom Ventures',
    projectId: null,
    projectName: null,
    assigneeId: null,
    assigneeName: null,
    dueOn: null,
    status: 'open',
    startedAt: null,
    completedAt: null,
    items: [],
    itemsDone: 0,
    itemsTotal: 0,
    commentCount: 0,
    fileCount: 0,
    phaseName: null,
    createdAt: '2026-11-01T09:00:00.000Z',
    canEdit: true,
    ...overrides,
  };
}

function renderBoard(
  tasks: TaskView[],
  setStage: (
    taskId: string,
    stage: TaskStage,
  ) => Promise<{ ok: true } | { ok: false; code: string }>,
) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <TaskBoard
        tasks={tasks}
        today={TODAY}
        showClient={true}
        currentUserId={ME}
        setStage={setStage}
      />
    </NextIntlClientProvider>,
  );
}

const column = (name: RegExp) => screen.getByRole('region', { name });

describe('task board', () => {
  it('shows the three columns with their counts, the client and the due urgency', () => {
    renderBoard(
      [
        task({ title: 'Escrever o texto', dueOn: '2026-11-09' }),
        task({
          title: 'Exportar biblioteca',
          dueOn: '2026-11-08',
          clientId: null,
          clientName: null,
        }),
        task({
          title: 'Enviar proposta',
          startedAt: '2026-11-08T10:00:00.000Z',
          dueOn: '2026-11-10',
        }),
        task({ title: 'Auditoria', status: 'done', completedAt: '2026-11-08T10:00:00.000Z' }),
      ],
      vi.fn(),
    );

    const todo = column(/^Por fazer/);
    expect(within(todo).getByText('2')).toBeTruthy();
    expect(within(todo).getByText('Hoje').className).toContain('text-warning');
    expect(within(todo).getByText('Estúdio')).toBeTruthy();
    expect(within(column(/^Em curso/)).getByText('Amanhã').className).toContain('text-warning');
    expect(within(column(/^Em curso/)).getByText('Bloom Ventures')).toBeTruthy();
    expect(within(column(/^Concluídas/)).getByText('Auditoria')).toBeTruthy();
    expect(
      within(column(/^Concluídas/))
        .getByRole('link', { name: 'Ver todas as concluídas' })
        .getAttribute('href'),
    ).toBe('/tasks?client=c1&status=done');
  });

  it('marks an overdue date in red', () => {
    renderBoard([task({ title: 'Atrasada', dueOn: '2026-11-02' })], vi.fn());
    const due = within(column(/^Por fazer/)).getByText(/2\/11|2 de nov/);
    expect(due.className).toContain('text-danger');
  });

  it('moves a card through the menu and keeps it there when the server agrees', async () => {
    const setStage = vi.fn(async () => ({ ok: true as const }));
    const target = task({ title: 'Rever o logótipo' });
    renderBoard([target], setStage);

    await userEvent.click(screen.getByRole('button', { name: 'Mover Rever o logótipo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Em curso' }));

    expect(setStage).toHaveBeenCalledWith(target.id, 'doing');
    await waitFor(() =>
      expect(within(column(/^Em curso/)).getByText('Rever o logótipo')).toBeTruthy(),
    );
  });

  it('returns the card and says why when the move is refused', async () => {
    const setStage = vi.fn(async () => ({ ok: false as const, code: 'not_found' }));
    renderBoard([task({ title: 'Rever o logótipo' })], setStage);

    await userEvent.click(screen.getByRole('button', { name: 'Mover Rever o logótipo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Concluídas' }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(within(column(/^Por fazer/)).getByText('Rever o logótipo')).toBeTruthy();
  });

  it('completing a card from its checkbox moves it to done', async () => {
    const setStage = vi.fn(async () => ({ ok: true as const }));
    const target = task({ title: 'Fechar a pasta', startedAt: '2026-11-08T10:00:00.000Z' });
    renderBoard([target], setStage);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Concluir Fechar a pasta' }));

    expect(setStage).toHaveBeenCalledWith(target.id, 'done');
    await waitFor(() =>
      expect(within(column(/^Concluídas/)).getByText('Fechar a pasta')).toBeTruthy(),
    );
  });

  it('offers no controls on a task the reader may not change', () => {
    renderBoard(
      [task({ title: 'De outra pessoa', canEdit: false, assigneeId: 'someone-else' })],
      vi.fn(),
    );
    expect(screen.queryByRole('button', { name: 'Mover De outra pessoa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Arrastar De outra pessoa' })).toBeNull();
    expect(
      screen.getByRole('checkbox', { name: 'Concluir De outra pessoa' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('lets the assignee move a task they cannot edit', () => {
    renderBoard([task({ title: 'Minha', canEdit: false, assigneeId: ME })], vi.fn());
    expect(screen.getByRole('button', { name: 'Mover Minha' })).toBeTruthy();
  });

  it('opens the task panel from the title', async () => {
    const target = task({ title: 'Abrir painel' });
    renderBoard([target], vi.fn());
    await userEvent.click(screen.getByRole('button', { name: 'Abrir painel' }));
    expect(replace).toHaveBeenCalledWith(`/tasks?client=c1&task=${target.id}`, { scroll: false });
  });
});
