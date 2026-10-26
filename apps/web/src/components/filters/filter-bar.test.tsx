// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@agency-os/ui/motion';
import { FilterBar } from './filter-bar';

const replace = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/tasks',
  useRouter: () => ({ replace }),
}));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  replace.mockReset();
  search = '';
});

afterEach(cleanup);

const SEGMENTS = {
  param: 'status',
  value: 'open',
  options: [
    { value: 'open', label: 'Por fazer', count: 3 },
    { value: 'done', label: 'Concluídas', count: 1 },
  ],
};

const SELECTS = [
  {
    param: 'client',
    label: 'Cliente',
    value: null,
    allLabel: 'Todos',
    options: [
      { value: 'c1', label: 'Atlas' },
      { value: 'c2', label: 'Boreal' },
    ],
  },
  {
    param: 'assignee',
    label: 'Responsável',
    value: null,
    allLabel: 'Todos',
    options: [{ value: 'p1', label: 'Rita' }],
  },
];

function renderBar() {
  return render(
    <MotionProvider>
      <FilterBar segments={SEGMENTS} selects={SELECTS} />
    </MotionProvider>,
  );
}

function lastUrl(): URL {
  const href = replace.mock.calls.at(-1)?.[0] as string;
  return new URL(href, 'http://localhost');
}

describe('FilterBar', () => {
  it('changes the url without a submit button', async () => {
    const user = userEvent.setup();
    renderBar();

    expect(screen.queryByRole('button', { name: /filtrar/i })).toBeNull();
    await user.click(screen.getByRole('tab', { name: /Concluídas/ }));

    expect(lastUrl().pathname).toBe('/tasks');
    expect(lastUrl().searchParams.get('status')).toBe('done');
  });

  it('keeps the other params and drops new', async () => {
    search = 'assignee=p1&new=1&project=x';
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('tab', { name: /Concluídas/ }));

    const params = lastUrl().searchParams;
    expect(params.get('assignee')).toBe('p1');
    expect(params.get('project')).toBe('x');
    expect(params.get('status')).toBe('done');
    expect(params.has('new')).toBe(false);
  });

  it('sets a select param and clears it with the all option', async () => {
    search = 'client=c2';
    const user = userEvent.setup();
    render(
      <MotionProvider>
        <FilterBar selects={SELECTS.slice(0, 1).map((select) => ({ ...select, value: 'c2' }))} />
      </MotionProvider>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Cliente' }));
    await user.click(await screen.findByRole('option', { name: 'Todos' }));

    expect(lastUrl().searchParams.has('client')).toBe(false);
  });

  it('last change wins when changed twice quickly', async () => {
    const user = userEvent.setup();
    renderBar();

    // The URL does not update between the clicks, as with a navigation still running.
    await user.click(screen.getByRole('tab', { name: /Concluídas/ }));
    await user.click(screen.getByRole('combobox', { name: 'Cliente' }));
    await user.click(await screen.findByRole('option', { name: 'Atlas' }));
    await user.click(screen.getByRole('combobox', { name: 'Cliente' }));
    await user.click(await screen.findByRole('option', { name: 'Boreal' }));

    const params = lastUrl().searchParams;
    expect(params.get('client')).toBe('c2');
    expect(params.get('status')).toBe('done');
  });
});
