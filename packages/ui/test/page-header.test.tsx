// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from '../src/components/page-header';

afterEach(cleanup);

describe('PageHeader', () => {
  it('renders title as h1 by default', () => {
    render(<PageHeader title="Tarefas" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Tarefas' })).toBeTruthy();
  });

  it('renders title as h2 when requested', () => {
    render(<PageHeader title="Tarefas" headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Tarefas' })).toBeTruthy();
  });

  it('renders actions', () => {
    render(<PageHeader title="Tarefas" actions={<button type="button">Nova tarefa</button>} />);
    expect(screen.getByRole('button', { name: 'Nova tarefa' })).toBeTruthy();
  });

  it('omits description when absent', () => {
    const { container } = render(<PageHeader title="Tarefas" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders description and context when given', () => {
    render(
      <PageHeader
        title="Tarefas"
        description="Tudo o que falta"
        context={<span>Projeto X</span>}
      />,
    );
    expect(screen.getByText('Tudo o que falta')).toBeTruthy();
    expect(screen.getByText('Projeto X')).toBeTruthy();
  });
});
