// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { TaskView } from '@/modules/tasks';
import { TaskFilters } from './task-filters';
import { TaskForm } from './task-form';
import { TaskList } from './task-list';

afterEach(() => {
  cleanup();
});

const CLIENT_A = '0b5e7f10-1c1a-4a8e-9a55-2f6a0b1c2d3e';
const CLIENT_B = '1c6f8a21-2d2b-4b9f-8b66-3a7b1c2d3e4f';
const PERSON = '2d7a9b32-3e3c-4c0a-9c77-4b8c2d3e4f50';
const TODAY = '2026-10-12';

function renderWithIntl(node: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

function task(overrides: Partial<TaskView>): TaskView {
  return {
    id: crypto.randomUUID(),
    title: 'Tarefa',
    notes: '',
    clientId: CLIENT_A,
    clientName: 'Atlas Lda',
    projectId: null,
    assigneeId: null,
    assigneeName: null,
    dueOn: null,
    status: 'open',
    items: [],
    canEdit: true,
    ...overrides,
  };
}

const OK = async () => ({ ok: true as const });

const FOUNDER = {
  id: '3e8b0c43-4f4d-4d1b-8d88-5c9d3e4f5061',
  name: 'Ana Fundadora',
  clientIds: null,
};
const FREELANCER = { id: PERSON, name: 'Rui Freelancer', clientIds: [CLIENT_A] };

describe('tasks', () => {
  it('offers edit and delete only on tasks the reader may edit', async () => {
    const remove = vi.fn(OK);
    const editable = task({ title: 'Minha sala' });
    renderWithIntl(
      <TaskList
        tasks={[editable, task({ title: 'Só concluir', canEdit: false })]}
        today={TODAY}
        showClient
        setStatus={OK}
        setItem={OK}
        edit={{ people: [FOUNDER], update: OK, remove }}
      />,
    );

    expect(screen.getAllByText('Editar')).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apagar tarefa Minha sala' }));
    });
    expect(remove).toHaveBeenCalledWith(editable.id);
  });

  it('task form offers only people who may take the chosen client task', () => {
    renderWithIntl(
      <TaskForm
        clients={[
          { id: CLIENT_A, name: 'Atlas Lda' },
          { id: CLIENT_B, name: 'Boreal SA' },
        ]}
        people={[FOUNDER, FREELANCER]}
        fixedClientId={null}
        create={OK}
      />,
    );
    const assigneeNames = () =>
      Array.from((screen.getByLabelText('Responsável') as HTMLSelectElement).options).map(
        (option) => option.text,
      );

    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: CLIENT_B } });
    expect(assigneeNames()).toEqual(['Sem responsável', 'Ana Fundadora']);
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: CLIENT_A } });
    expect(assigneeNames()).toEqual(['Sem responsável', 'Ana Fundadora', 'Rui Freelancer']);
  });

  it('groups tasks by today, this week and later', () => {
    renderWithIntl(
      <TaskList
        tasks={[
          task({ title: 'Atrasada', dueOn: '2026-10-10' }),
          task({ title: 'Para hoje', dueOn: TODAY }),
          task({ title: 'Sexta', dueOn: '2026-10-16' }),
          task({ title: 'Próximo mês', dueOn: '2026-11-03' }),
          task({ title: 'Quando der', dueOn: null }),
        ]}
        today={TODAY}
        showClient
        setStatus={OK}
        setItem={OK}
      />,
    );

    const today = screen.getByRole('region', { name: 'Hoje' });
    const week = screen.getByRole('region', { name: 'Esta semana' });
    const later = screen.getByRole('region', { name: 'Mais tarde' });
    expect(
      within(today)
        .getAllByRole('checkbox')
        .map((box) => box.getAttribute('aria-label')),
    ).toEqual(['Atrasada', 'Para hoje']);
    expect(within(today).getByText('Atrasada')).toBeTruthy();
    expect(within(today).getAllByText('Atrasado')).toHaveLength(1);
    expect(within(week).getByText('Sexta')).toBeTruthy();
    expect(within(later).getByText('Próximo mês')).toBeTruthy();
    expect(within(later).getByText('Quando der')).toBeTruthy();
  });

  it('completing a task and an item calls the actions', async () => {
    const setStatus = vi.fn(OK);
    const setItem = vi.fn(OK);
    const subject = task({
      title: 'Exportar ficheiros',
      dueOn: TODAY,
      items: [{ id: 'item-1', position: 1, title: 'Logótipo', done: false }],
    });
    renderWithIntl(
      <TaskList
        tasks={[subject]}
        today={TODAY}
        showClient={false}
        setStatus={setStatus}
        setItem={setItem}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Logótipo' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Exportar ficheiros' }));
    });

    expect(setItem).toHaveBeenCalledWith('item-1', true);
    expect(setStatus).toHaveBeenCalledWith(subject.id, 'done');
  });

  it('filters by client and assignee', () => {
    renderWithIntl(
      <TaskFilters
        action="/tasks"
        clients={[
          { id: CLIENT_A, name: 'Atlas Lda' },
          { id: CLIENT_B, name: 'Boreal SA' },
        ]}
        people={[{ id: PERSON, name: 'Rita Gestora' }]}
        current={{ clientId: CLIENT_B, assigneeId: PERSON, status: 'open' }}
      />,
    );

    const client = screen.getByLabelText('Cliente') as HTMLSelectElement;
    const assignee = screen.getByLabelText('Responsável') as HTMLSelectElement;
    expect(client.name).toBe('client');
    expect(client.value).toBe(CLIENT_B);
    expect(assignee.name).toBe('assignee');
    expect(assignee.value).toBe(PERSON);
    expect(
      screen.getByRole('button', { name: 'Filtrar' }).closest('form')?.getAttribute('action'),
    ).toBe('/tasks');
  });

  it('task form keeps values when refused', async () => {
    const create = vi.fn(async () => ({ ok: false as const, code: 'invalid_input' }));
    renderWithIntl(
      <TaskForm
        clients={[{ id: CLIENT_A, name: 'Atlas Lda' }]}
        people={[{ id: PERSON, name: 'Rita Gestora', clientIds: null }]}
        fixedClientId={null}
        create={create}
      />,
    );

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Rever logótipo' } });
    fireEvent.change(screen.getByLabelText('Subtarefas'), {
      target: { value: 'Cores\n\nTipografia' },
    });
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-14' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    });

    expect(create).toHaveBeenCalledWith({
      title: 'Rever logótipo',
      notes: '',
      clientId: null,
      assigneeId: null,
      dueOn: '2026-10-14',
      items: ['Cores', 'Tipografia'],
    });
    expect(screen.getByText('Verifique os campos e tente de novo.')).toBeTruthy();
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Rever logótipo');
  });
});
