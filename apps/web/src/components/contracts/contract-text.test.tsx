// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContractText } from './contract-text';

afterEach(() => {
  cleanup();
});

const BODY = [
  '# Contrato de prestação de serviços',
  '',
  '## 2. Âmbito',
  '',
  '### Módulo A — Vídeo e motion graphics',
  '',
  '- Edição de vídeo',
  '- Motion graphics',
  '',
  'Volume contratado: 8 vídeos por mês.',
].join('\n');

describe('ContractText', () => {
  it('reads the contract as headings, lists and paragraphs without markdown marks', () => {
    const { container } = render(<ContractText body={BODY} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Contrato de prestação de serviços' }));
    expect(screen.getByRole('heading', { level: 3, name: '2. Âmbito' }));
    expect(screen.getByRole('heading', { level: 4, name: 'Módulo A — Vídeo e motion graphics' }));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Edição de vídeo',
      'Motion graphics',
    ]);
    expect(screen.getByText('Volume contratado: 8 vídeos por mês.').tagName).toBe('P');
    expect(container.textContent).not.toContain('#');
  });
});
