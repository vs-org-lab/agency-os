// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlockedState } from '../src/components/states/blocked-state';
import { EmptyState } from '../src/components/states/empty-state';
import { ErrorState } from '../src/components/states/error-state';
import { LoadingState } from '../src/components/states/loading-state';

describe('state components', () => {
  it('state components render translated title', () => {
    render(
      <>
        <EmptyState
          title="Ainda não há nada aqui"
          description="Quando houver conteúdo, aparece neste espaço."
        />
        <ErrorState
          title="Algo correu mal"
          action={<button type="button">Tentar novamente</button>}
        />
        <BlockedState title="Bloqueado" description="À espera de uma ação anterior." />
        <LoadingState title="A carregar" />
      </>,
    );

    expect(screen.getByRole('heading', { name: 'Ainda não há nada aqui' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Algo correu mal');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeDefined();
    expect(screen.getByText('À espera de uma ação anterior.')).toBeDefined();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('A carregar');
  });
});
