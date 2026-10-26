// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DatePicker } from '../src/components/date-picker';

afterEach(cleanup);

function renderPicker(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  return render(
    <form data-testid="form">
      <DatePicker
        name="dueDate"
        locale="pt-PT"
        label="Data"
        placeholder="Escolher data"
        clearLabel="Limpar"
        {...props}
      />
    </form>,
  );
}

function hiddenValue(): string {
  const form = screen.getByTestId('form') as HTMLFormElement;
  return String(new FormData(form).get('dueDate'));
}

describe('DatePicker', () => {
  it('shows the date in the session locale', () => {
    renderPicker({ defaultValue: '2026-10-31' });
    expect(screen.getByRole('button', { name: /Data/ }).textContent).toContain('31/10/2026');
  });

  it('shows month first in english', () => {
    renderPicker({ defaultValue: '2026-10-31', locale: 'en' });
    expect(screen.getByRole('button', { name: /Data/ }).textContent).toContain('10/31/2026');
  });

  it('submits ISO in the hidden field', async () => {
    const user = userEvent.setup();
    renderPicker({ defaultValue: '2026-10-31' });
    expect(hiddenValue()).toBe('2026-10-31');

    await user.click(screen.getByRole('button', { name: /Data/ }));
    await user.click(await screen.findByRole('button', { name: /15/ }));
    expect(hiddenValue()).toBe('2026-10-15');
  });

  it('clear empties the hidden field', async () => {
    const user = userEvent.setup();
    const changes: Array<string | null> = [];
    renderPicker({ defaultValue: '2026-10-31', onChange: (value) => changes.push(value) });

    await user.click(screen.getByRole('button', { name: /Data/ }));
    await user.click(await screen.findByRole('button', { name: 'Limpar' }));

    expect(hiddenValue()).toBe('');
    expect(changes).toEqual([null]);
  });

  it('submits an empty value when nothing is chosen', () => {
    renderPicker();
    expect(hiddenValue()).toBe('');
  });

  it('opens with Enter and closes with Escape returning focus', async () => {
    const user = userEvent.setup();
    renderPicker({ defaultValue: '2026-10-31' });
    const trigger = screen.getByRole('button', { name: /Data/ });

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('follows a controlled value, including a reset to empty', () => {
    const { rerender } = render(
      <form data-testid="form">
        <DatePicker
          name="dueDate"
          locale="pt-PT"
          label="Data"
          placeholder="Escolher data"
          clearLabel="Limpar"
          value="2026-10-31"
        />
      </form>,
    );
    expect(hiddenValue()).toBe('2026-10-31');

    rerender(
      <form data-testid="form">
        <DatePicker
          name="dueDate"
          locale="pt-PT"
          label="Data"
          placeholder="Escolher data"
          clearLabel="Limpar"
          value=""
        />
      </form>,
    );
    expect(hiddenValue()).toBe('');
    expect(screen.getByRole('button', { name: /Data/ }).textContent).toContain('Escolher data');
  });
});
