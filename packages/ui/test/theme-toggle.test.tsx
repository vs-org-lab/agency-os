// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { ThemeProvider } from '../src/theme/theme-provider';
import { ThemeToggle } from '../src/theme/theme-toggle';
import { installMatchMedia } from './match-media';

beforeAll(() => {
  installMatchMedia();
});

describe('ThemeToggle', () => {
  it('theme toggle switches between light, dark and system', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle label="Tema" labels={{ light: 'Claro', dark: 'Escuro', system: 'Sistema' }} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Tema' })).toBeDefined();

    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('radio', { name: 'Escuro' }).getAttribute('aria-checked')).toBe('true');

    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await userEvent.click(screen.getByRole('radio', { name: 'Sistema' }));
    expect(screen.getByRole('radio', { name: 'Sistema' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });
});
