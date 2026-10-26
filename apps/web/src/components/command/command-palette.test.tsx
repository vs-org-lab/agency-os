// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from './command-palette';
import type { SearchOutcome } from './search';

const push = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => vi.fn<(query: string) => Promise<SearchOutcome>>());

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('./actions', () => ({ searchWorkspaceAction: search }));

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const navigation = [
  { href: '/', labelKey: 'shell.studioNav.home', icon: 'home' },
  { href: '/tasks', labelKey: 'shell.studioNav.tasks', icon: 'tasks' },
] as const;

function renderPalette() {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <button type="button">Gatilho</button>
      <CommandPalette
        navigation={[...navigation]}
        createActions={[{ labelKey: 'command.create.newTask', href: '/tasks?new=1' }]}
      />
    </NextIntlClientProvider>,
  );
}

const hit = (title: string): SearchOutcome => ({
  ok: true,
  results: [{ kind: 'client', id: title, title, context: null, href: `/c/${title}` }],
});

describe('CommandPalette', () => {
  it('opens with Ctrl+K', async () => {
    const user = userEvent.setup();
    renderPalette();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.keyboard('{Control>}k{/Control}');

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('opens from the open event dispatched by the sidebar field', async () => {
    renderPalette();
    window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('lists navigation and create groups', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');

    expect(await screen.findByText('Ir para')).toBeTruthy();
    expect(screen.getByRole('option', { name: /Tarefas/ })).toBeTruthy();
    expect(screen.getByText('Criar')).toBeTruthy();
    expect(screen.getByRole('option', { name: /Nova tarefa/ })).toBeTruthy();
  });

  it('navigates on Enter', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog');

    await user.keyboard('{ArrowDown}{Enter}');

    expect(push).toHaveBeenCalledWith('/tasks');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('navigates to a search result', async () => {
    const user = userEvent.setup();
    search.mockResolvedValue(hit('abc'));
    renderPalette();
    await user.keyboard('{Control>}k{/Control}');

    await user.type(await screen.findByRole('combobox'), 'abc');
    await user.click(await screen.findByRole('option', { name: /abc/ }));

    expect(push).toHaveBeenCalledWith('/c/abc');
  });

  it('ignores a stale response', async () => {
    const user = userEvent.setup();
    let resolveFirst: (value: SearchOutcome) => void = () => undefined;
    search.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    search.mockResolvedValueOnce(hit('second'));
    renderPalette();
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox');

    await user.type(input, 'ab');
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await user.type(input, 'c');
    expect(await screen.findByRole('option', { name: /second/ })).toBeTruthy();

    resolveFirst(hit('first'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByRole('option', { name: /first/ })).toBeNull();
    expect(screen.getByRole('option', { name: /second/ })).toBeTruthy();
    expect(search).toHaveBeenNthCalledWith(1, 'ab');
    expect(search).toHaveBeenNthCalledWith(2, 'abc');
  });

  it('does not search for a single character', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard('{Control>}k{/Control}');

    await user.type(await screen.findByRole('combobox'), 'a');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(search).not.toHaveBeenCalled();
  });

  it('returns focus to the trigger on close', async () => {
    const user = userEvent.setup();
    renderPalette();
    const trigger = screen.getByRole('button', { name: 'Gatilho' });
    trigger.focus();

    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
