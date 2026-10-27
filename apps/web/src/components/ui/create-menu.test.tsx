// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@agency-os/ui/motion';
import { CreateMenu } from './create-menu';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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

afterEach(cleanup);

const ITEMS = [
  { label: 'Nova tarefa', href: '/tasks?new=1', icon: <span /> },
  { label: 'Novo evento', href: '/calendar?new=1', icon: <span /> },
];

function setup() {
  render(
    <MotionProvider>
      <CreateMenu label="Novo" items={ITEMS} />
    </MotionProvider>,
  );
  return screen.getByRole('button', { name: 'Novo' });
}

describe('CreateMenu', () => {
  it('opens with Enter and closes with Escape returning focus', async () => {
    const user = userEvent.setup();
    const trigger = setup();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeTruthy();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      '/tasks?new=1',
      '/calendar?new=1',
    ]);
    await waitFor(() => expect(document.activeElement).toBe(items[0]));

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items[1]);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Novo' })),
    );
  });

  it('activates the focused item with Space', async () => {
    const user = userEvent.setup();
    const clicked = vi.fn((event: Event) => event.preventDefault());
    const trigger = setup();
    trigger.focus();
    await user.keyboard('{Enter}');
    const [first] = await screen.findAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement).toBe(first));
    first?.addEventListener('click', clicked);

    await user.keyboard(' ');

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('closes when the pointer goes down outside', async () => {
    const user = userEvent.setup();
    const trigger = setup();
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeTruthy();
    await user.click(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('renders nothing when there are no items', () => {
    render(
      <MotionProvider>
        <CreateMenu label="Novo" items={[]} />
      </MotionProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
