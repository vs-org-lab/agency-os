// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@agency-os/ui/theme';
import { AccountMenu } from './account-menu';

vi.mock('./sign-out-action', () => ({ signOutAction: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(cleanup);

const labels = {
  account: 'Conta',
  theme: 'Tema',
  themeOptions: { light: 'Claro', dark: 'Escuro', system: 'Sistema' },
  locale: 'Idioma',
  localeOptions: { 'pt-PT': 'Português', en: 'English' },
  signOut: 'Terminar sessão',
};

function show() {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={{}}>
      <ThemeProvider>
        <AccountMenu
          user={{ name: 'Vladimir Silva', email: 'vladimir@aurion.pt' }}
          labels={labels}
        />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe('AccountMenu', () => {
  it('shows the person and opens theme, language and sign out', async () => {
    show();
    const trigger = screen.getByRole('button', { name: /Vladimir Silva/ });
    expect(trigger.textContent).toContain('vladimir@aurion.pt');
    expect(screen.queryByRole('radiogroup', { name: 'Tema' })).toBeNull();

    await userEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Conta' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Escuro' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Português' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Terminar sessão' })).toBeTruthy();
  });

  it('closes with Escape and gives focus back to the trigger', async () => {
    show();
    const trigger = screen.getByRole('button', { name: /Vladimir Silva/ });

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Conta' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
