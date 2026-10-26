// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import { TaskCreate } from './task-create';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OK = async () => ({ ok: true as const });

function renderCreate(overrides: Partial<React.ComponentProps<typeof TaskCreate>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <TaskCreate
          canCreate
          openRequested={false}
          clients={[]}
          people={[]}
          fixedClientId={null}
          create={OK}
          {...overrides}
        />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('TaskCreate', () => {
  it('opens the task sheet from the New task button', async () => {
    renderCreate();
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    expect(screen.getByRole('dialog', { name: 'Nova tarefa' })).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Nova tarefa' })).toBeTruthy();
  });

  it('opens automatically with new=1 when the user can create', () => {
    renderCreate({ openRequested: true });
    expect(screen.getByRole('dialog', { name: 'Nova tarefa' })).toBeTruthy();
  });

  it('does not render the button or open when the user cannot create', () => {
    renderCreate({ canCreate: false, openRequested: true });
    expect(screen.queryByRole('button', { name: 'Nova tarefa' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes and notifies after the task is created', async () => {
    const create = vi.fn(OK);
    renderCreate({ create });
    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    await userEvent.type(screen.getByLabelText('Título'), 'Rever entregas');
    await userEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(create).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Tarefa criada.', undefined);
  });

  it('stays open without notifying when the task is refused', async () => {
    renderCreate({ create: async () => ({ ok: false as const, code: 'invalid_input' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    await userEvent.type(screen.getByLabelText('Título'), 'Rever entregas');
    await userEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => expect(screen.getByText(/Verifique os campos/)).toBeTruthy());
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
