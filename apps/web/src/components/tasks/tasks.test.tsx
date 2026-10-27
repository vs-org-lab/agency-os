// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import { chooseDay, chooseOption, installRadixDomPolyfills } from '../../../test/radix-dom';
import { TaskFilters } from './task-filters';
import { TaskForm } from './task-form';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/tasks',
  useRouter: () => ({ replace: vi.fn() }),
}));

beforeAll(installRadixDomPolyfills);

afterEach(() => {
  cleanup();
});

const CLIENT_A = '0b5e7f10-1c1a-4a8e-9a55-2f6a0b1c2d3e';
const CLIENT_B = '1c6f8a21-2d2b-4b9f-8b66-3a7b1c2d3e4f';
const PERSON = '2d7a9b32-3e3c-4c0a-9c77-4b8c2d3e4f50';

function renderWithIntl(node: React.ReactNode) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const OK = async () => ({ ok: true as const });

/** The picker opens on the current month when it has no date yet. */
function monthDay(day: number): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${String(day).padStart(2, '0')}`;
}

const FOUNDER = {
  id: '3e8b0c43-4f4d-4d1b-8d88-5c9d3e4f5061',
  name: 'Ana Fundadora',
  clientIds: null,
};
const FREELANCER = { id: PERSON, name: 'Rui Freelancer', clientIds: [CLIENT_A] };

describe('tasks', () => {
  it('task form offers only people who may take the chosen client task', async () => {
    const user = userEvent.setup();
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
    const assigneeNames = async () => {
      await user.click(screen.getByRole('combobox', { name: 'Responsável' }));
      const names = screen
        .getAllByRole('option')
        .map(
          (option) =>
            option.querySelector('[data-slot="member-name"]')?.textContent ?? option.textContent,
        );
      await user.keyboard('{Escape}');
      return names;
    };

    await chooseOption(user, 'Cliente', 'Boreal SA');
    expect(await assigneeNames()).toEqual(['Sem responsável', 'Ana Fundadora']);
    await chooseOption(user, 'Cliente', 'Atlas Lda');
    expect(await assigneeNames()).toEqual(['Sem responsável', 'Rui Freelancer', 'Ana Fundadora']);
  });

  it('filters by client and assignee with counts per status', () => {
    renderWithIntl(
      <MotionProvider>
        <TaskFilters
          clients={[
            { id: CLIENT_A, name: 'Atlas Lda' },
            { id: CLIENT_B, name: 'Boreal SA' },
          ]}
          people={[{ id: PERSON, name: 'Rita Gestora' }]}
          current={{ clientId: CLIENT_B, assigneeId: PERSON, status: 'open' }}
          counts={{ open: 4, done: 2, all: 6 }}
          currentUserId={PERSON}
        />
      </MotionProvider>,
    );

    expect(screen.getByRole('combobox', { name: 'Cliente' }).textContent).toContain('Boreal SA');
    expect(screen.getByRole('combobox', { name: 'Responsável' }).textContent).toContain(
      'Rita Gestora',
    );
    expect(screen.getByRole('tab', { name: /Por fazer/ }).textContent).toContain('4');
    expect(screen.getByRole('tab', { name: /Concluídas/ }).textContent).toContain('2');
    expect(screen.queryByRole('button', { name: 'Filtrar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Minhas' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
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
    await chooseDay(userEvent.setup(), /^Data/, 14);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    });

    expect(create).toHaveBeenCalledWith({
      title: 'Rever logótipo',
      notes: '',
      clientId: null,
      assigneeId: null,
      dueOn: monthDay(14),
      items: ['Cores', 'Tipografia'],
    });
    expect(screen.getByText('Verifique os campos e tente de novo.')).toBeTruthy();
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Rever logótipo');
  });

  it('task form submits the same data as before with a chosen client, assignee and date', async () => {
    const user = userEvent.setup();
    const create = vi.fn(OK);
    renderWithIntl(
      <TaskForm
        clients={[
          { id: CLIENT_A, name: 'Atlas Lda' },
          { id: CLIENT_B, name: 'Boreal SA' },
        ]}
        people={[FOUNDER, FREELANCER]}
        fixedClientId={null}
        create={create}
      />,
    );

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Rever' } });
    await chooseOption(user, 'Cliente', 'Atlas Lda');
    await user.click(screen.getByRole('combobox', { name: 'Responsável' }));
    await user.click(screen.getByRole('option', { name: /Rui Freelancer/ }));
    await chooseDay(user, /^Data/, 9);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    });

    expect(create).toHaveBeenCalledWith({
      title: 'Rever',
      notes: '',
      clientId: CLIENT_A,
      assigneeId: PERSON,
      dueOn: monthDay(9),
      items: [],
    });
  });

  describe('inside an overlay (onDone given)', () => {
    it('reports creation through onDone without an inline success message', async () => {
      const onDone = vi.fn();
      renderWithIntl(
        <TaskForm clients={[]} people={[]} fixedClientId={null} create={OK} onDone={onDone} />,
      );
      fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Rever' } });
      await act(async () => {
        fireEvent.submit(screen.getByRole('form'));
      });
      expect(onDone).toHaveBeenCalledWith('Tarefa criada.');
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
