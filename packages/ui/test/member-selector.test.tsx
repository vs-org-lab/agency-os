// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemberSelector } from '../src/components/member-selector';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(cleanup);

const MEMBERS = [
  { id: 'u1', name: 'Ana Rocha' },
  { id: 'u2', name: 'Bruno Dias' },
  { id: 'u3', name: 'Carla Mendes', priority: true },
  { id: 'u4', name: 'Diogo Alves', priority: true },
];

function Harness({
  initial = null,
  onChange,
  name,
}: {
  initial?: string | null;
  onChange?: (id: string | null) => void;
  name?: string;
}) {
  const [value, setValue] = React.useState<string | null>(initial);
  return (
    <MemberSelector
      members={MEMBERS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      label="Responsável"
      unassignedLabel="Sem responsável"
      searchPlaceholder="Procurar por nome"
      name={name}
    />
  );
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: /Responsável/ }));
  return screen.getByRole('listbox');
}

describe('MemberSelector', () => {
  it('filters members by name', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const list = await open(user);

    await user.type(screen.getByPlaceholderText('Procurar por nome'), 'bru');

    expect(
      within(list)
        .getAllByRole('option')
        .map(
          (option) =>
            option.querySelector('[data-slot="member-name"]')?.textContent ?? option.textContent,
        ),
    ).toEqual(['Bruno Dias']);
  });

  it('priority members come first', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const list = await open(user);

    expect(
      within(list)
        .getAllByRole('option')
        .map(
          (option) =>
            option.querySelector('[data-slot="member-name"]')?.textContent ?? option.textContent,
        ),
    ).toEqual(['Sem responsável', 'Carla Mendes', 'Diogo Alves', 'Ana Rocha', 'Bruno Dias']);
  });

  it('choosing unassigned clears the value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="u2" onChange={onChange} />);
    expect(screen.getByRole('combobox', { name: /Responsável/ }).textContent).toContain(
      'Bruno Dias',
    );

    await open(user);
    await user.click(screen.getByRole('option', { name: 'Sem responsável' }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('combobox', { name: /Responsável/ }).textContent).toContain(
      'Sem responsável',
    );
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('hidden input carries the value', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness name="assignee" />);
    const hidden = () =>
      container.querySelector<HTMLInputElement>('input[type="hidden"][name="assignee"]');
    expect(hidden()?.value).toBe('');

    await open(user);
    await user.click(screen.getByRole('option', { name: 'Ana Rocha' }));

    expect(hidden()?.value).toBe('u1');
  });

  it('supports the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    screen.getByRole('combobox', { name: /Responsável/ }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('u3');
  });
});
