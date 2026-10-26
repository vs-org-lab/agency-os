// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import { CreateDialog } from './create-dialog';
import { CreateSheet } from './create-sheet';

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

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>{node}</MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe.each([
  ['CreateDialog', CreateDialog, 'dialog'],
  ['CreateSheet', CreateSheet, 'dialog'],
] as const)('%s', (_name, Component, role) => {
  it('opens from the labelled trigger', async () => {
    wrap(
      <Component label="Nova tarefa" title="Criar tarefa">
        {() => <p>Formulário</p>}
      </Component>,
    );
    expect(screen.queryByRole(role)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    expect(screen.getByRole(role, { name: 'Criar tarefa' })).toBeTruthy();
    expect(screen.getByText('Formulário')).toBeTruthy();
  });

  it('closes and notifies on success', async () => {
    wrap(
      <Component label="Nova tarefa" title="Criar tarefa">
        {(close) => (
          <button type="button" onClick={() => close({ message: 'Tarefa criada' })}>
            Guardar
          </button>
        )}
      </Component>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.queryByRole(role)).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Tarefa criada', undefined);
  });

  it('stays open without notifying when the form reports an error', async () => {
    wrap(
      <Component label="Nova tarefa" title="Criar tarefa">
        {() => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <p role="alert">Título obrigatório</p>
            <button type="submit">Guardar</button>
          </form>
        )}
      </Component>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole(role)).toBeTruthy();
    expect(screen.getByText('Título obrigatório')).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('closes without notifying when no result is given', async () => {
    wrap(
      <Component label="Nova tarefa" title="Criar tarefa">
        {(close) => (
          <button type="button" onClick={() => close()}>
            Fechar já
          </button>
        )}
      </Component>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar já' }));
    expect(screen.queryByRole(role)).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('returns focus to the trigger on close', async () => {
    wrap(
      <Component label="Nova tarefa" title="Criar tarefa">
        {(close) => (
          <button type="button" onClick={() => close()}>
            Fechar já
          </button>
        )}
      </Component>,
    );
    const trigger = screen.getByRole('button', { name: 'Nova tarefa' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger);
  });

  it('names the trigger with triggerLabel when given', () => {
    wrap(
      <Component label="Editar" triggerLabel="Editar Atlas" title="Atlas">
        {() => <p>Formulário</p>}
      </Component>,
    );
    expect(screen.getByRole('button', { name: 'Editar Atlas' })).toBeTruthy();
  });

  it('opens initially when defaultOpen', () => {
    wrap(
      <Component label="Nova tarefa" title="Criar tarefa" defaultOpen>
        {() => <p>Formulário</p>}
      </Component>,
    );
    expect(screen.getByRole(role, { name: 'Criar tarefa' })).toBeTruthy();
  });
});
