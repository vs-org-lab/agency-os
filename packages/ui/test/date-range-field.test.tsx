// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DateRangeField } from '../src/components/date-range-field';

afterEach(cleanup);

type Range = { from: string; to: string } | null;

function renderField(props: Partial<React.ComponentProps<typeof DateRangeField>> = {}) {
  const changes: Range[] = [];
  render(
    <DateRangeField
      locale="pt-PT"
      label="Período"
      placeholder="Todo o ano"
      value={null}
      onChange={(next) => changes.push(next)}
      min="2026-01-01"
      max="2026-12-31"
      presets={[
        { label: 'Este mês', from: '2026-10-01', to: '2026-10-31' },
        { label: 'Este ano', from: '2026-01-01', to: '2026-12-31' },
      ]}
      clearLabel="Limpar"
      {...props}
    />,
  );
  return changes;
}

describe('DateRangeField', () => {
  it('preset sets the range', async () => {
    const user = userEvent.setup();
    const changes = renderField();

    await user.click(screen.getByRole('button', { name: /Período/ }));
    await user.click(await screen.findByRole('button', { name: 'Este mês' }));

    expect(changes).toEqual([{ from: '2026-10-01', to: '2026-10-31' }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clear resets', async () => {
    const user = userEvent.setup();
    const changes = renderField({ value: { from: '2026-10-01', to: '2026-10-31' } });

    expect(screen.getByRole('button', { name: /Período/ }).textContent).toContain(
      '01/10/2026 – 31/10/2026',
    );
    await user.click(screen.getByRole('button', { name: /Período/ }));
    await user.click(await screen.findByRole('button', { name: 'Limpar' }));

    expect(changes).toEqual([null]);
  });

  it('dates outside min and max are disabled', async () => {
    const user = userEvent.setup();
    renderField({ min: '2026-10-10', max: '2026-10-20' });

    await user.click(screen.getByRole('button', { name: /Período/ }));
    const inside = await screen.findByRole('button', { name: /(^|\s)15.*outubro/i });
    const before = screen.getByRole('button', { name: /(^|\s)5.*outubro/i });
    const after = screen.getByRole('button', { name: /(^|\s)25.*outubro/i });

    expect((inside as HTMLButtonElement).disabled).toBe(false);
    expect((before as HTMLButtonElement).disabled).toBe(true);
    expect((after as HTMLButtonElement).disabled).toBe(true);
  });

  it('picking two days commits the range', async () => {
    const user = userEvent.setup();
    const changes = renderField({ min: '2026-10-01', max: '2026-10-31' });

    await user.click(screen.getByRole('button', { name: /Período/ }));
    await user.click(await screen.findByRole('button', { name: /(^|\s)12.*outubro/i }));
    expect(changes).toEqual([]);
    await user.click(screen.getByRole('button', { name: /(^|\s)14.*outubro/i }));

    expect(changes).toEqual([{ from: '2026-10-12', to: '2026-10-14' }]);
  });
});
