// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { FileText, Inbox, Users } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from '../src/components/states/empty-state';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title="Sem tarefas"
        description="Crie a primeira tarefa."
        action={<button type="button">Nova tarefa</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Sem tarefas' })).toBeTruthy();
    expect(screen.getByText('Crie a primeira tarefa.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeTruthy();
  });

  it('accepts the legacy icon prop', () => {
    const { container } = render(
      <EmptyState title="Vazio" icon={<Inbox data-testid="legacy" />} />,
    );
    expect(screen.getByTestId('legacy')).toBeTruthy();
    expect(container.querySelectorAll('[data-slot="empty-media"] svg')).toHaveLength(1);
  });

  it('renders three fanned icons', () => {
    const { container } = render(
      <EmptyState
        title="Vazio"
        icons={[<Users key="a" />, <FileText key="b" />, <Inbox key="c" />]}
      />,
    );
    const items = container.querySelectorAll('[data-slot="empty-media"] > *');
    expect(items).toHaveLength(3);
    expect(items[0]?.className).toContain('-rotate-6');
    expect(items[2]?.className).toContain('rotate-6');
    expect(items[1]?.className).not.toContain('rotate-6');
  });

  it('rows variant renders hidden ghost rows', () => {
    const { container } = render(<EmptyState title="Vazio" variant="rows" />);
    const rows = container.querySelector('[data-slot="empty-rows"]');
    expect(rows?.getAttribute('aria-hidden')).toBe('true');
    expect(rows?.children.length).toBeGreaterThan(0);
  });

  it('plain variant has no ghost rows', () => {
    const { container } = render(<EmptyState title="Vazio" />);
    expect(container.querySelector('[data-slot="empty-rows"]')).toBeNull();
  });

  it('has no dashed border', () => {
    const { container } = render(<EmptyState title="Vazio" />);
    expect(container.innerHTML).not.toContain('border-dashed');
  });
});
